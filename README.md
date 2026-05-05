# 🔍 USER PASS DETECTOR (EXCODE Edition)

![EXCODE BRAND](https://img.shields.io/badge/Brand-EXCODE-blueviolet?style=for-the-badge)
![MADE BY](https://img.shields.io/badge/Made%20By-MR%20MIZ-orange?style=for-the-badge)
![Discord](https://img.shields.io/badge/Discord-Join%20Us-7289DA?style=for-the-badge&logo=discord)

A high-accuracy automated credential detection system designed to scan videos for usernames, passwords, and other sensitive information using advanced OCR and spatial analysis.

## 🚀 Features

- **High-Accuracy OCR Pipeline**: Uses EasyOCR with multi-pass image preprocessing (CLAHE & Sharpening).
- **Spatial Analysis**: Intelligently identifies relationships between labels (e.g., "Username:") and their corresponding values.
- **FastAPI Backend**: Efficient background processing for video analysis.
- **Interactive Web Interface**: Real-time progress tracking and visual detection reports.
- **Scene Change Detection**: Optimized scanning to handle dynamic UI changes in videos.

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, Uvicorn
- **Computer Vision**: OpenCV, EasyOCR, NumPy
- **Frontend**: HTML5, Vanilla CSS, Javascript
- **Media Processing**: FFmpeg

## 📥 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/user-pass-detector.git
   cd user-pass-detector
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Install FFmpeg**:
   Ensure `ffmpeg` and `ffprobe` are installed and added to your system's PATH.

## 🚦 Usage

1. **Start the server**:
   ```bash
   python main.py
   ```
2. **Access the Web UI**:
   Open your browser and navigate to `http://localhost:8004`.
3. **Upload Video**:
   Upload the video file you want to scan. The system will process it and display hits in real-time.

## 🤝 Community & Support

This project is part of the **EXCODE** ecosystem. For updates, support, or to join our community:

📢 **Discord**: [Join EXCODE Discord](https://discord.gg/NxSgSYKEWC)

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Created with ❤️ by **MR MIZ** under the **EXCODE** brand.*
