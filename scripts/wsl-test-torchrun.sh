#!/usr/bin/env bash
source "/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/activate"
cd /mnt/f/ai-video-tool/scripts
python3 -c "from opensora_inference_support import opensora_inference_argv; print(opensora_inference_argv('/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/python3', ['test.py']))"
ls -la "/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/torchrun"
