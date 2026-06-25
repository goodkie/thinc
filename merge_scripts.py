
import os

files = ['dictionary.js', 'analyzer.js', 'content.js']
output_file = 'content_merged.js'

def merge_files():
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for fname in files:
            with open(fname, 'r', encoding='utf-8') as infile:
                outfile.write(f"\n/* --- START OF {fname} --- */\n")
                outfile.write(infile.read())
                outfile.write(f"\n/* --- END OF {fname} --- */\n")
    print(f"Successfully merged into {output_file}")

if __name__ == "__main__":
    merge_files()
