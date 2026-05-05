# 🔍 USER PASS DETECTOR (EXCODE)

![EXCODE BRAND](https://img.shields.io/badge/Brand-EXCODE-blueviolet?style=for-the-badge)
![ENGINEERED BY](https://img.shields.io/badge/Engineered%20By-MR%20MIZ-orange?style=for-the-badge)
![Discord](https://img.shields.io/badge/Discord-Join%20Us-7289DA?style=for-the-badge\&logo=discord)

**A video analysis system that extracts structured text patterns using OCR, spatial reasoning, and intelligent filtering.**

---

## 🚀 Overview

**USER PASS DETECTOR** is an automated video-processing pipeline designed to scan visual content, extract text, and detect structured patterns such as credential-like formats.

Instead of simple OCR dumping, the system applies:

* Multi-stage image preprocessing
* Spatial relationship analysis
* Context-aware filtering

to produce **clean, structured, and meaningful output**.

> Built as a proof-of-concept for transforming raw visual data into structured intelligence.

---

## ⚙️ Core Features

* **High-Accuracy OCR Pipeline**

  * EasyOCR with multi-pass preprocessing (CLAHE + sharpening)
  * Improves detection on low-quality or noisy frames

* **Spatial Analysis Engine**

  * Detects relationships between labels and values
  * Example: linking `"Username:" → actual value`

* **Scene Change Detection**

  * Avoids redundant frame processing
  * Optimized for dynamic video content

* **FastAPI Backend**

  * Handles background processing efficiently
  * Scalable architecture for future extensions

* **Interactive Web Interface**

  * Real-time progress tracking
  * Visual detection results and output preview

---

## 🛠️ Tech Stack

* **Backend**: Python, FastAPI, Uvicorn
* **Computer Vision**: OpenCV, EasyOCR, NumPy
* **Frontend**: HTML5, CSS, JavaScript
* **Media Processing**: FFmpeg

---

## 📥 Installation

```bash
# Clone repository
git clone https://github.com/your-username/user-pass-detector.git
cd user-pass-detector

# Install dependencies
pip install -r requirements.txt
```

### Install FFmpeg

Make sure `ffmpeg` and `ffprobe` are installed and added to PATH.

---

## 🚦 Usage

```bash
# Start server
python main.py
```

Open browser:

```
http://localhost:8004
```

Upload a video → system processes → results appear in real-time.

---

## 🧠 Proof of Work

* ✔ Processes real video input
* ✔ Extracts text using OCR
* ✔ Applies spatial + contextual filtering
* ✔ Produces structured output instead of raw text dump

---

## 🤝 Community

Part of the **EXCODE** ecosystem.

📢 Discord: [https://discord.gg/NxSgSYKEWC](https://discord.gg/NxSgSYKEWC)

---

## 📜 License

MIT License — see `LICENSE` file.

---

## 👨‍💻 Author

**MR MIZ**
System-focused developer building backend systems, automation tools, and real-world applications.



