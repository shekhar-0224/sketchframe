"""Animate one panel with Wan 2.2 image-to-video on a free Hugging Face ZeroGPU Space.

    python animate-clip.py <image> <out.mp4> <seconds> "<motion prompt>"

Needs `pip install gradio_client`. Set HF_TOKEN for a larger free GPU quota than anonymous use.
"""
import os
import shutil
import sys

from gradio_client import Client, handle_file

SPACE = os.environ.get("WAN_SPACE", "zerogpu-aoti/wan2-2-fp8da-aoti-faster")
STYLE = "Black-and-white hand-drawn pencil sketch animation. Keep the exact line-art style, monochrome, the same characters and framing. "
NEGATIVE = "colour, photo realistic, 3D render, static, blurry, distorted face, extra limbs, text"

image, out, seconds, motion = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
client = Client(SPACE, token=os.environ.get("HF_TOKEN") or None, verbose=False)
video, _ = client.predict(
    handle_file(image), STYLE + motion, 6, NEGATIVE, min(max(seconds, 2.0), 5.0), 1, 1, 42, True,
    api_name="/generate_video",
)
shutil.copy(video["video"] if isinstance(video, dict) else video, out)
