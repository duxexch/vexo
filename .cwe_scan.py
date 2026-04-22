import os, re, json
root = r'c:\Users\cex\Desktop\vixo'
ext = []
patterns = {
    'infinite_loop': re.compile(r'\bwhile\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)') ,
    'always_true_false': re.compile(r'\bif\s*\(\s*true\s*\)|\bif\s*\(\s*false\s*\)|\bwhile\s*\(\s*true\s*\)|\b0\s*==\s*1|\b1\s*==\s*0'),
    'deprecated': re.compile(r'\bnew\s+Buffer\b|\bdeprecated\b|\bobsolete\b|\bSystem\.out\.|\bdocument\.write\b|\balert\('),
    'uninitialized': re.compile(r'\b(let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*;'),
    'loop_input': re.compile(r'for\s*\(.*\b(parseInt|Number\(|JSON\.parse|req\.|req\.query|req\.body|params\[|query\[|body\[).*;.*\)|while\s*\(.*\b(parseInt|Number\(|JSON\.parse|req\.|req\.query|req\.body|params\[|query\[|body\[).*\)') ,
    'operator_precedence': re.compile(r'[^\n]*\b(\S+)\s*&&\s*[^\n]*\|\|[^\n]*|[^\n]*\|\|[^\n]*&&[^\n]*'),
    'length_mismatch': re.compile(r'\b(length|byteLength|size)\b.*\b(===|!==|==|!=|<|>)\s*\b(?!0\b)\w+\b|\bBuffer\.alloc\([^)]*\)|\bnew\s+Uint8Array\([^)]*\)'),
}
results = {k: [] for k in patterns}
for dirpath, dirnames, filenames in os.walk(root):
    if any(part in ['node_modules', '.git', 'build', 'dist', 'android/build', 'logs', 'backups', 'uploads'] for part in dirpath.replace(root, '').split(os.sep)):
        continue
    for fn in filenames:
        if fn.endswith(('.ts','.tsx','.js','.jsx','.java','.kt','.sh','.gradle','.xml')):
            fp = os.path.join(dirpath, fn)
            try:
                with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                    data = f.read()
            except Exception:
                continue
            for key, pat in patterns.items():
                for m in pat.finditer(data):
                    line = data[:m.start()].count('\n') + 1
                    results[key].append({'file': os.path.relpath(fp, root).replace('\\','/'), 'line': line, 'match': m.group(0).strip()})
print(json.dumps(results, indent=2))
