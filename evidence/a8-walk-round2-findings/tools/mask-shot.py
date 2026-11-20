"""Paint over the site address, deed number and coordinates in a committed screenshot.
usage: python3 tools/mask-shot.py <png> <x0,y0,x1,y1> [...]   (pixels of the original image)"""
import sys
from PIL import Image, ImageDraw

path, boxes = sys.argv[1], [tuple(int(v) for v in b.split(',')) for b in sys.argv[2:]]
img = Image.open(path).convert('RGB')
draw = ImageDraw.Draw(img)
for box in boxes:
    draw.rectangle(box, fill=(60, 60, 60))
img.save(path, optimize=True)
