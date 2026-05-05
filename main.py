from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
import shutil
import os
import uuid
from detector import Detector

app = FastAPI()

# Create directories
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Custom static files with no-cache headers
class NoCacheStaticFiles(StaticFiles):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
    
    async def __call__(self, scope, receive, send):
        async def send_wrapper(message):
            if message['type'] == 'http.response.start':
                headers = list(message.get('headers', []))
                headers.append((b'cache-control', b'no-cache, no-store, must-revalidate'))
                headers.append((b'pragma', b'no-cache'))
                headers.append((b'expires', b'0'))
                message['headers'] = headers
            await send(message)
        await super().__call__(scope, receive, send_wrapper)

# Mount frontend with no-cache
app.mount("/static", NoCacheStaticFiles(directory="frontend/static"), name="static")

# Shared detector instance
detector = Detector()

# Store task status and results
tasks = {}
stop_signals = {}

@app.post("/cancel/{file_id}")
async def cancel_task(file_id: str):
    if file_id in tasks:
        stop_signals[file_id] = True
        return {"status": "cancelling"}
    return {"error": "Task not found"}

@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    tasks[file_id] = {
        "status": "processing",
        "stage": "upload",
        "message": "Upload complete",
        "percent": 5,
        "result": None
    }
    stop_signals[file_id] = False
    
    # Process in background
    background_tasks.add_task(run_analysis, file_id, file_path)
    
    return {"id": file_id}

@app.get("/status/{file_id}")
async def get_status(file_id: str):
    if file_id not in tasks:
        return JSONResponse(status_code=404, content={"error": "Not found"})
    return tasks[file_id]

def extract_credential_values(detection):
    """
    Post-process detection to extract actual credential values from the frame image.
    For example: 'USERNAME : HIDDEN' -> extract 'HIDDEN'
                 'PASSWORD' '888' -> extract '888'
    """
    import easyocr
    import cv2
    import re
    
    if not detection.get('image'):
        return detection
    
    try:
        # Load the saved frame image
        image_path = detection['image'].replace('/static/', 'frontend/static/')
        if not os.path.exists(image_path):
            return detection
        
        # Read the image and perform OCR
        print(f"[*] Refining values from high-res output frame: {image_path}")
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        img = cv2.imread(image_path)
        
        # CRITICAL FIX: Apply the same preprocessing (Green Channel + Sharpening)
        # used in detector.py to ensure green text is visible to OCR
        img = detector.preprocess_image(img)
        
        results = reader.readtext(img)
        
        # Build list of text blocks with their positions
        text_blocks = [(bbox, text.strip(), prob) for (bbox, text, prob) in results if prob > 0.25]
        
        # Build full text context
        full_text = " ".join([text for (_, text, _) in text_blocks])
        
        extracted_users = []
        extracted_passes = []
        
        # Strategy 1: Look for "KEYWORD : VALUE" pattern in combined text
        # This handles cases like "USERNAME : HIDDEN"
        user_colon_patterns = [
            r'username\s*:\s*([a-zA-Z0-9_@.]+)',
            r'user\s*:\s*([a-zA-Z0-9_@.]+)',
            r'login\s*:\s*([a-zA-Z0-9_@.]+)',
            r'email\s*:\s*([a-zA-Z0-9_@.]+)',
        ]
        
        pass_colon_patterns = [
            r'password\s*:\s*([a-zA-Z0-9_@.!#$%]+)',
            r'pass\s*:\s*([a-zA-Z0-9_@.!#$%]+)',
            r'pin\s*:\s*([0-9]+)',
        ]
        
        # Try colon patterns first
        for pattern in user_colon_patterns:
            matches = re.findall(pattern, full_text, re.IGNORECASE)
            extracted_users.extend(matches)
        
        for pattern in pass_colon_patterns:
            matches = re.findall(pattern, full_text, re.IGNORECASE)
            extracted_passes.extend(matches)
        
        # Strategy 2: Adjacent block check (vertical - next line)
        if not extracted_passes:
            for i, (bbox, text, prob) in enumerate(text_blocks):
                text_lower = text.lower()
                if any(kw in text_lower for kw in ['password', 'pass', 'pin', 'pwd', 'secret']):
                    if i + 1 < len(text_blocks):
                        next_text = text_blocks[i + 1][1]
                        if len(next_text) <= 30 and not any(kw in next_text.lower() for kw in ['username', 'user', 'login', 'email', 'name']):
                            extracted_passes.append(next_text)

        # Strategy 3: Spatial Analysis (Horizontal)
        # This is critical for side-by-side layouts like "Username: [Value]"
        if not extracted_passes or not extracted_users:
            for i, (bbox_label, text_label, prob_label) in enumerate(text_blocks):
                text_lower = text_label.lower()
                y_center = (bbox_label[0][1] + bbox_label[2][1]) / 2
                x_right = bbox_label[1][0]

                # Find Username Value (Spatial)
                if not extracted_users and any(kw in text_lower for kw in ['username', 'user', 'login', 'email', 'name']):
                    for j, (bbox_val, text_val, prob_val) in enumerate(text_blocks):
                        if i == j: continue
                        val_y_center = (bbox_val[0][1] + bbox_val[2][1]) / 2
                        val_x_left = bbox_val[0][0]
                        
                        # Check horizontal alignment (within 20px) and to the right
                        if abs(y_center - val_y_center) < 20 and val_x_left > x_right:
                             if not any(kw in text_val.lower() for kw in ['pass', 'pwd', 'login']):
                                extracted_users.append(text_val)
                                break
                
                # Find Password Value (Spatial)
                if not extracted_passes and any(kw in text_lower for kw in ['password', 'pass', 'pin', 'pwd', 'secret']):
                    for j, (bbox_val, text_val, prob_val) in enumerate(text_blocks):
                        if i == j: continue
                        val_y_center = (bbox_val[0][1] + bbox_val[2][1]) / 2
                        val_x_left = bbox_val[0][0]
                        
                        if abs(y_center - val_y_center) < 20 and val_x_left > x_right:
                             if not any(kw in text_val.lower() for kw in ['user', 'email']):
                                extracted_passes.append(text_val)
                                break
        
        if not extracted_users:
            for i, (bbox, text, prob) in enumerate(text_blocks):
                text_lower = text.lower()
                # If we find a user keyword, look at the next text block
                if any(kw in text_lower for kw in ['username', 'user', 'login', 'email', 'name']):
                    if i + 1 < len(text_blocks):
                        next_text = text_blocks[i + 1][1].strip()
                        # Relaxed check: Accept if reasonable length and not a keyword
                        if len(next_text) <= 40 and len(next_text) > 2:
                            if not any(kw in next_text.lower() for kw in ['username', 'password', 'user', 'pass', 'login', 'email', 'pin']):
                                print(f"  [→] Found username value: {next_text}")
                                extracted_users.append(next_text)
        
        # Update detection with extracted values (if found)
        if extracted_users:
            detection['user_values'] = list(set(extracted_users))  # Remove duplicates
        if extracted_passes:
            detection['pass_values'] = list(set(extracted_passes))  # Remove duplicates
            
        print(f"[→] Extracted: User={extracted_users}, Pass={extracted_passes}")
            
    except Exception as e:
        print(f"[!] Error extracting values: {e}")
    
    return detection

def run_analysis(file_id: str, file_path: str):
    def progress_callback(progress_data):
        """Update task progress in real-time"""
        tasks[file_id].update({
            "status": "processing",
            **progress_data
        })
    
    try:
        def stop_check():
            return stop_signals.get(file_id, False)

        result = detector.process_video(file_path, progress_callback=progress_callback, stop_callback=stop_check)
        
        # Post-process detections to extract actual credential values
        if result.get('detections'):
            for detection in result['detections']:
                extract_credential_values(detection)
        
        tasks[file_id] = {
            "status": "complete",
            "stage": "complete",
            "message": "Analysis complete!",
            "percent": 100,
            "result": result
        }
    except Exception as e:
        tasks[file_id] = {
            "status": "error",
            "stage": "error",
            "message": str(e),
            "percent": 0
        }
    finally:
        # Optionally remove the video file after processing to save space
        if os.path.exists(file_path):
            os.remove(file_path)

@app.get("/")
async def read_index():
    response = FileResponse("frontend/index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)

