import sys
from PIL import Image
out = sys.argv[1]; ims = [Image.open(f).convert('RGB') for f in sys.argv[2:]]
sc = float(__import__('os').environ.get('SC', '0.6'))
ims = [i.resize((int(i.width * sc), int(i.height * sc))) for i in ims]
m = Image.new('RGB', (sum(i.width for i in ims), max(i.height for i in ims)))
x = 0
for i in ims: m.paste(i, (x, 0)); x += i.width
m.save(out)
