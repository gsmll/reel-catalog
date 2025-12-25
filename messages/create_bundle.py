import json
import os
import sys
from pathlib import Path

def create_bundle():
    # Use script's directory for relative path resolution
    base_dir = Path(__file__).parent.resolve()

    
    # Read core files
    with open(os.path.join(base_dir, 'index.html'), 'r') as f:
        html = f.read()
    
    with open(os.path.join(base_dir, 'index.css'), 'r') as f:
        css = f.read()
        
    with open(os.path.join(base_dir, 'index.js'), 'r') as f:
        js = f.read()
        
    with open(os.path.join(base_dir, 'reels_data.js'), 'r') as f:
        reels_data_js = f.read()

    # Inline CSS
    css_bundle = f"<style>\n{css}\n</style>"
    html = html.replace('<link rel="stylesheet" href="index.css">', css_bundle)
    
    # Inline JS and Data
    # We remove the script tags for the external files and add our inlined ones
    js_bundle = f"<script>\n{reels_data_js}\n{js}\n</script>"
    
    # Find the script tags to replace
    import re
    html = re.sub(r'<script src="reels_data.js"></script>', '', html)
    html = re.sub(r'<script src="index.js"></script>', js_bundle, html)
    
    # Output the bundle
    output_path = os.path.join(base_dir, 'shareable_catalog.html')
    with open(output_path, 'w') as f:
        f.write(html)
        
    print(f"✓ Portable bundle created at: {output_path}")

if __name__ == "__main__":
    create_bundle()
