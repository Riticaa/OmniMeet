from PIL import Image
import os

mockup_path = r"C:\Users\Riticaa\.gemini\antigravity-ide\brain\dd42ca58-7d3b-4819-9f67-a06c9ea6b543\.user_uploaded\media_1791122036169.png"
out_dir = r"d:\OmniMeet\frontend\assets"
os.makedirs(out_dir, exist_ok=True)

im = Image.open(mockup_path).convert("RGB")
# Exact bounding boxes of the 4 video boxes in media_1791122036169.png (882x568)
im.crop((57, 120, 201, 241)).save(os.path.join(out_dir, "sofia.png"))
im.crop((208, 120, 352, 241)).save(os.path.join(out_dir, "alex.png"))
im.crop((359, 120, 503, 241)).save(os.path.join(out_dir, "yuki.png"))
im.crop((509, 120, 653, 241)).save(os.path.join(out_dir, "jamie.png"))

print("Saved all 4 participant portraits as PNG successfully!")
