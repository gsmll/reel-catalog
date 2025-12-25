
import json
import os

def parse_reels(file_path):
    reels = []
    with open(file_path, 'r') as f:
        content = f.read()
        # The file contains multiple JSON objects separated by newlines or just concatenated
        # Based on the view_file output, it looks like:
        # { ... }
        # { ... }
        # We need to split them or parse them manually.
        # Actually, let's try to parse it as a stream of objects
        import re
        # Find all JSON objects
        objects = re.findall(r'\{.*?\}', content, re.DOTALL)
        for obj_str in objects:
            try:
                data = json.loads(obj_str)
                if 'reel' in data:
                    reels.append({
                        'url': data['reel'],
                        'user': data.get('user', 'Unknown'),
                        'timestamp': data.get('timestamp', '')
                    })
            except:
                continue
    return reels

def main():
    base_dir = '/Users/gabesmall/.gemini/antigravity/scratch/insta_loader/messages'
    messages_file = os.path.join(base_dir, 'messages.json')
    output_file = os.path.join(base_dir, 'reels_data.js')

    if not os.path.exists(messages_file):
        print(f"File {messages_file} not found")
        return

    reels = parse_reels(messages_file)
    
    # Sort reels by timestamp descending
    reels.sort(key=lambda x: x['timestamp'], reverse=True)

    with open(output_file, 'w') as f:
        f.write("const reelsData = ")
        json.dump(reels, f, indent=2)
        f.write(";")
    
    print(f"Extracted {len(reels)} reels to {output_file}")

if __name__ == "__main__":
    main()
