"""Copy the recorded videos to where the Help page serves them, with a poster frame and the duration (D-63).

	python3 tools/videos/publish.py

	hospital_vvs/public/help/<slug>.pdf               guides (tools/guides/build.mjs writes them there; in git)
	hospital_vvs/public/downloads/videos/NN-*.webm    videos + .jpg posters + index.json (not in git; copy to each server)
	<bench>/deliverables/hospital_vvs/                guides + videos as one set to hand over
"""

import glob
import json
import os
import re
import shutil
import subprocess

from PIL import Image, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "../.."))
BENCH = os.path.abspath(os.path.join(APP, "../.."))
PUBLIC = os.path.join(APP, "hospital_vvs/public")
VIDEOS = os.path.join(HERE, "out")
DELIVER = os.path.join(BENCH, "deliverables", "hospital_vvs")
FFMPEG = os.path.expanduser("~/.cache/ms-playwright/ffmpeg-1010/ffmpeg-linux")


def main():
	vid_dir = os.path.join(PUBLIC, "downloads", "videos")
	for d in (vid_dir, os.path.join(DELIVER, "videos"), os.path.join(DELIVER, "guides")):
		os.makedirs(d, exist_ok=True)
	for pdf in glob.glob(os.path.join(PUBLIC, "help", "*.pdf")):
		shutil.copy2(pdf, os.path.join(DELIVER, "guides", f"VVS-Hospital-{os.path.basename(pdf)}"))
	n, index = 0, {}
	for v in sorted(glob.glob(os.path.join(VIDEOS, "[0-9][0-9]-*.webm"))):
		name = os.path.basename(v)
		for dest in (vid_dir, os.path.join(DELIVER, "videos")):
			shutil.copy2(v, os.path.join(dest, name))
		probe = subprocess.run([FFMPEG, "-i", v], capture_output=True, text=True).stderr
		m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe)
		secs = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0
		index[name] = {"seconds": round(secs)}
		poster = os.path.join(vid_dir, name[:-5] + ".jpg")
		# the most detailed of four frames (skips title cards and loading screens); Playwright's ffmpeg has no JPEG encoder
		best, best_score = None, -1.0
		for frac in (0.3, 0.45, 0.6, 0.75) if secs > 30 else (0.5,):
			png = f"{poster[:-4]}-{int(frac * 100)}.png"
			subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", str(round(secs * frac, 1) if secs else 5), "-i", v, "-frames:v", "1", "-vf", "scale=960:-1", png], check=False)
			if not os.path.exists(png):
				continue
			im = Image.open(png).convert("RGB")
			score = sum(ImageStat.Stat(im.convert("L").crop((0, 0, im.width, int(im.height * 0.78)))).stddev)
			if score > best_score:
				best, best_score = im.copy(), score
			os.remove(png)
		if best is not None:
			best.save(poster, "JPEG", quality=84)
		n += 1
	with open(os.path.join(vid_dir, "index.json"), "w") as f:
		json.dump(index, f, indent=1)
	print(f"{n} videos -> {vid_dir}\nset -> {DELIVER}")


if __name__ == "__main__":
	main()
