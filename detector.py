import subprocess
import easyocr
import cv2
import numpy as np
import os
import re
import subprocess
import json
import tempfile
import shutil
from datetime import timedelta
import uuid

class Detector:
    def __init__(self, languages=['en'], gpu=False):
        """🟦 STAGE 0 — CONFIGURATION"""
        print("[*] Initializing High-Accuracy OCR Pipeline...")
        import warnings
        warnings.filterwarnings("ignore", category=UserWarning, module="torch")

        # Disable GPU for consistency
        self.reader = easyocr.Reader(languages, gpu=gpu)
        
        # MAXIMUM ACCURACY MODE - Time doesn't matter
        self.max_ocr_frames = 500  # Process way more frames
        self.ocr_width = 1920      # MAXIMUM resolution for crystal clear text
        self.confidence_threshold = 0.1 # Very low threshold to catch faint/blurry text
        self.scene_change_threshold = 4.0 # More sensitive to scene changes
        self.text_signal_threshold = 0.005 # Lowered to catch minimal text UIs
        
        # MAXIMUM COVERAGE - Expanded Patterns for All Scenarios
        self.tier1_user = re.compile(r'(?i)\b(user(name)?|uname|acc(ount)?|id|login|email|e-?mail|name|key|license)\b')
        self.tier2_pass = re.compile(r'(?i)\b(pass(word)?|passwd|pwd|pw|pin|secret|token|code|serial|key)\b')

    def preprocess_image(self, img):
        """Apply optimized preprocessing for green text visibility without speed penalty"""
        # Use Green channel directly (index 1 in BGR) - Best for green text on dark backgrounds
        # This is faster than cvtColor and enhances the specific target
        gray = img[:,:,1] if len(img.shape) == 3 else img
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Apply MILD sharpening kernel (prevent artifacts)
        # The previous kernel was too aggressive for small text
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(enhanced, -1, kernel)
        
        # Removed fastNlMeansDenoising as it is extremely slow
        # With higher resolution, we don't need aggressive denoising
        
        # Convert back to BGR for easyocr
        return cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)
    
    def normalize_text(self, text):
        """STAGE 4 — TEXT NORMALIZATION"""
        text = text.lower().strip()
        replacements = {'l0gin': 'login', 'passw0rd': 'password', 'ema1l': 'email', 'pa55': 'pass', 'p4ss': 'pass', 'u5er': 'user'}
        for old, new in replacements.items():
            text = text.replace(old, new)
        return "".join(c for c in text if c.isalnum() or c.isspace() or c in "@._-") # Keep symbols common in credentials

    def get_video_info(self, video_path):
        try:
            cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,duration,nb_frames', '-of', 'json', video_path]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            stream = data['streams'][0]
            avg_rate = stream.get('avg_frame_rate', '30/1').split('/')
            fps = float(avg_rate[0]) / float(avg_rate[1]) if len(avg_rate) == 2 else 30.0
            return {"fps": fps, "duration": float(stream.get('duration', 0)), "total_frames": int(stream.get('nb_frames', 0))}
        except Exception: return {"fps": 30.0, "duration": 0, "total_frames": 0}

    def process_video(self, video_path, frame_interval=1, progress_callback=None, stop_callback=None):
        """🟦 STAGES 1 TO 7 — ORCHESTRATION (Two-Pass Optimization)"""
        if not os.path.exists(video_path): return {"error": "File not found"}
        
        def report_progress(stage, message, percent=0, **kwargs):
            if progress_callback:
                progress_callback({
                    "stage": stage,
                    "message": message,
                    "percent": percent,
                    **kwargs
                })
            
        info = self.get_video_info(video_path)
        fps = info['fps']
        
        # 📂 PERSISTENT FRAME STORAGE
        base_name = os.path.splitext(os.path.basename(video_path))[0]
        safe_name = "".join(c for c in base_name if c.isalnum() or c in (' ', '-', '_')).strip()
        temp_dir = os.path.join("extracted_frames", safe_name[:50])
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir, exist_ok=True)
        
        print(f"[*] Saving ALL frames to: {os.path.abspath(temp_dir)}")
        
        try:
            # 🟦 STAGE 1 — FRAME EXTRACTION
            report_progress("extraction", f"Extracting frames to {temp_dir}...", 10)
            print(f"[*] Stage 1: Fast Frame Extraction (1 FPS)...")
            extract_cmd = ['ffmpeg', '-i', video_path, '-vf', f'fps=1/{frame_interval}', os.path.join(temp_dir, 'frame_%04d.jpg'), '-y', '-loglevel', 'error']
            subprocess.run(extract_cmd)

            frame_files = sorted([f for f in os.listdir(temp_dir) if f.endswith('.jpg')])
            total_frames = len(frame_files)
            
            # 🟦 STAGE 2 — PRE-FILTERING (Remove Noise/Black Frames)
            valid_frames = []
            print(f"[*] Stage 2: Validating {total_frames} frames...")
            
            for i, f_name in enumerate(frame_files):
                f_path = os.path.join(temp_dir, f_name)
                # Quick check without full load if possible, but we need content
                img = cv2.imread(f_path)
                if img is None: continue
                
                if np.mean(img) < 10: # Skip pitch black frames
                    continue
                    
                valid_frames.append({'path': f_path, 'index': i, 'img': img})

            # 🟦 STAGE 3 & 4 — INTERLEAVED RAPID SCAN & DEEP VERIFICATION
            # Scan frames sequentially. If suspicious, verify immediately.
            detections = []
            fast_width = 500 # Increased for better detection, offset by removing denoise
            
            report_progress("ocr", f"Scanning {len(valid_frames)} frames (Rapid + Deep Check)...", 30, total_frames=len(valid_frames))
            print(f"[*] Starting Interleaved Scan on {len(valid_frames)} frames...")
            
            for idx, item in enumerate(valid_frames):
                # Check cancellation
                if stop_callback and stop_callback():
                    print("[!] Process stopped by user.")
                    break

                img = item['img']
                h, w = img.shape[:2]
                
                # --- MULTI-PASS SCANNING FOR MAXIMUM ACCURACY ---
                # Pass 1: Original image (low resolution for speed check)
                scale_fast = 320 / float(w)
                fast_img = cv2.resize(img, (int(w * scale_fast), int(h * scale_fast)))
                results_fast = self.reader.readtext(fast_img, detail=0)
                text_content_pass1 = " ".join(results_fast).lower()
                
                # Pass 2: Preprocessed image (also low res for speed)
                preprocessed_fast = self.preprocess_image(fast_img)
                results_fast_enhanced = self.reader.readtext(preprocessed_fast, detail=0)
                text_content_pass2 = " ".join(results_fast_enhanced).lower()
                
                # Combine both passes for keyword detection
                combined_text = text_content_pass1 + " " + text_content_pass2
                
                # Check for credential keywords (broader search)
                is_suspicious = False
                keywords = ["user", "pass", "login", "key", "name", "account", "pwd", "secret", "email", "pin"]
                if any(kw in combined_text for kw in keywords):
                    is_suspicious = True
                    print(f"  [+] Suspicious content at frame {item['index']}... Verifying!")

                # --- PHASE B: DEEP VERIFICATION (If Suspicious) ---
                if is_suspicious:
                    scale_deep = self.ocr_width / float(w) # Now 1920px for maximum clarity
                    deep_img = cv2.resize(img, (int(w * scale_deep), int(h * scale_deep)))
                    
                    # MULTI-PASS DEEP OCR
                    # Pass 1: Original high-res image
                    results_deep_original = self.reader.readtext(deep_img)
                    
                    # Pass 2: Preprocessed high-res image
                    preprocessed_deep = self.preprocess_image(deep_img)
                    results_deep_enhanced = self.reader.readtext(preprocessed_deep)
                    
                    # Combine results from both passes
                    results_deep = results_deep_original + results_deep_enhanced
                    
                    # Remove duplicates based on similar text and position
                    seen = set()
                    unique_results = []
                    for (bbox, text, prob) in results_deep:
                        text_key = text.lower().strip()
                        if text_key not in seen:
                            seen.add(text_key)
                            unique_results.append((bbox, text, prob))
                    results_deep = unique_results
                    
                    timestamp_str = str(timedelta(seconds=int(item['index'] * frame_interval)))
                    video_frame = int(item['index'] * fps * frame_interval)
                    
                    frame_user_hits = []
                    frame_pass_hits = []

                    for (bbox, text, prob) in results_deep:
                        if prob < self.confidence_threshold: continue
                        norm = self.normalize_text(text)
                        
                        if "regedit" in norm: continue

                        if self.tier1_user.search(norm):
                            frame_user_hits.append(text)
                        elif self.tier2_pass.search(norm):
                            frame_pass_hits.append(text)

                    if frame_user_hits or frame_pass_hits:
                        # Save match frame
                        frame_filename = f"frame_{video_frame}_{uuid.uuid4().hex[:8]}.jpg"
                        frame_save_path = os.path.join("frontend", "static", "frames", frame_filename)
                        os.makedirs(os.path.dirname(frame_save_path), exist_ok=True)
                        cv2.imwrite(frame_save_path, img)
                        
                        # ADVANCED VALUE EXTRACTION - Multiple Strategies
                        full_txt = " ".join([t for (_, t, _) in results_deep])
                        
                        # Strategy 1: Regex pattern matching (colon/equals separators)
                        u_vals = re.findall(r'(?:user|login|email|username|uname|name|account)\s*[:=]\s*([a-zA-Z0-9_@.\-]+)', full_txt, re.IGNORECASE)
                        p_vals = re.findall(r'(?:pass|password|passwd|pwd|pin|secret)\s*[:=]\s*([a-zA-Z0-9_@.!#$%*\-]+)', full_txt, re.IGNORECASE)
                        
                        # Strategy 2: Adjacent block check (vertical - next line)
                        if not p_vals:
                            for i, (_, t, _) in enumerate(results_deep):
                                if any(k in t.lower() for k in ['pass', 'pwd', 'password', 'secret', 'pin']) and i+1 < len(results_deep):
                                    next_val = results_deep[i+1][1].strip()
                                    # Accept if not a label and has content
                                    if not any(k in next_val.lower() for k in ['user', 'login', 'pass', 'pwd', 'password', 'email', 'name', 'account']) and len(next_val) > 0:
                                        print(f"  [→] Found password (adjacent): {next_val}")
                                        p_vals.append(next_val)
                        
                        if not u_vals:
                            for i, (_, t, _) in enumerate(results_deep):
                                if any(k in t.lower() for k in ['user', 'login', 'email', 'username', 'name', 'account', 'uname']) and i+1 < len(results_deep):
                                    next_val = results_deep[i+1][1].strip()
                                    # Accept if not a label and has reasonable length
                                    if not any(k in next_val.lower() for k in ['pass', 'pwd', 'login', 'password', 'email', 'name', 'account', 'user']) and len(next_val) > 2:
                                        print(f"  [→] Found username (adjacent): {next_val}")
                                        u_vals.append(next_val)
                        
                        # Strategy 3: Spatial analysis (horizontal - same row)
                        if not p_vals or not u_vals:
                            for i, (bbox_label, text_label, prob_label) in enumerate(results_deep):
                                text_lower = text_label.lower()
                                # Get center Y coordinate of this text
                                y_center = (bbox_label[0][1] + bbox_label[2][1]) / 2
                                x_right = bbox_label[1][0]  # Right edge of label
                                
                                # Look for password label
                                if not p_vals and any(k in text_lower for k in ['pass', 'pwd', 'password', 'secret', 'pin']):
                                    # Find values on the same horizontal line (within 30px)
                                    for j, (bbox_val, text_val, prob_val) in enumerate(results_deep):
                                        if i == j: continue
                                        val_y_center = (bbox_val[0][1] + bbox_val[2][1]) / 2
                                        val_x_left = bbox_val[0][0]
                                        # Check if on same row and to the right
                                        if abs(y_center - val_y_center) < 30 and val_x_left > x_right:
                                            if not any(k in text_val.lower() for k in ['pass', 'user', 'login', 'email']):
                                                print(f"  [→] Found password (spatial): {text_val}")
                                                p_vals.append(text_val.strip())
                                                break
                                
                                # Look for username label
                                if not u_vals and any(k in text_lower for k in ['user', 'login', 'email', 'username', 'name', 'account']):
                                    for j, (bbox_val, text_val, prob_val) in enumerate(results_deep):
                                        if i == j: continue
                                        val_y_center = (bbox_val[0][1] + bbox_val[2][1]) / 2
                                        val_x_left = bbox_val[0][0]
                                        if abs(y_center - val_y_center) < 30 and val_x_left > x_right:
                                            if not any(k in text_val.lower() for k in ['pass', 'user', 'login', 'email', 'password']):
                                                print(f"  [→] Found username (spatial): {text_val}")
                                                u_vals.append(text_val.strip())
                                                break

                        detections.append({
                            "frame": video_frame,
                            "timestamp": timestamp_str,
                            "user": frame_user_hits,
                            "pass": frame_pass_hits,
                            "user_values": list(set(u_vals)),
                            "pass_values": list(set(p_vals)),
                            "image": f"/static/frames/{frame_filename}"
                        })
                        print(f"[!] Hit at {timestamp_str}: USER={frame_user_hits}, PASS={frame_pass_hits}")
                        
                        # Update progress with detection count
                        report_progress("ocr", f"Found {len(detections)} matches so far...", 
                                      30 + int((idx / len(valid_frames)) * 60), 
                                      detection_count=len(detections),
                                      current_detections=detections)
                
                # Periodic progress update even if no hit
                if idx % 10 == 0:
                     report_progress("ocr", f"Scanning... ({idx}/{len(valid_frames)})", 
                                      30 + int((idx / len(valid_frames)) * 60))

            detections.sort(key=lambda x: x['frame'])
            report_progress("complete", "Analysis complete!", 100, detections=len(detections))
            return {"file": os.path.basename(video_path), "fps": fps, "detections": detections}

        finally:
            # NO DELETION - Keep frames for inspection
            print(f"[*] Frames retained in: {temp_dir}")


if __name__ == "__main__":
    import sys
    video = sys.argv[1] if len(sys.argv) > 1 else None
    if video:
        det = Detector()
        result = det.process_video(video)
        print(json.dumps(result, indent=4))
    else:
        print("Usage: python detector.py <video_path>")
