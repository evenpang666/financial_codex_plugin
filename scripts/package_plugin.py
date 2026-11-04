"""Build a clean distributable; never include credentials, user data or local venvs."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT=Path(__file__).resolve().parent.parent
output=ROOT/'dist';output.mkdir(exist_ok=True)
version=json.loads((ROOT/'.codex-plugin/plugin.json').read_text(encoding='utf-8'))['version']
target=output/f'financial-agent-{version}.zip'
folders=['.codex-plugin','lib','engine','scripts','skills','web','tests','data-corrections','node_modules']
files=[ROOT/name for name in ['marketplace.example.json','.env.example','package.json','package-lock.json','requirements.txt','uv.toml','README.md','LICENSE','start.bat','start.sh','stop.bat','stop.sh']]
for folder in folders:
    files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.log','.tmp'))
files.extend((ROOT/'config').glob('*.example.*'))
files.extend(p for p in (ROOT/'docs').rglob('*') if p.is_file() and p.suffix.lower() in {'.md', '.png', '.jpg', '.jpeg', '.svg', '.webp'})
node=os.environ.get('FINANCE_NODE','node')
portable=subprocess.check_output([node,str(ROOT/'scripts/configure-mcp.mjs'),'--print-portable'],cwd=ROOT,encoding='utf-8')
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        archive.write(path,path.relative_to(ROOT).as_posix())
    archive.writestr('.agents/plugins/marketplace.json',(ROOT/'marketplace.example.json').read_text(encoding='utf-8-sig'))
    archive.writestr('.mcp.json',portable)
# Replace the generated directory instead of retaining stale files from an older build.
# Resolve and check the exact target before any recursive deletion on Windows.
directory=output/'financial-agent'
if directory.is_symlink() or directory.resolve().parent != output.resolve():
    raise RuntimeError(f'Unsafe distribution directory: {directory}')
with tempfile.TemporaryDirectory(prefix='plugin-',dir=output) as temporary:
    with ZipFile(target) as archive:
        archive.extractall(temporary)
    if directory.exists():
        shutil.rmtree(directory)
    shutil.move(temporary,directory)
subprocess.run([node,str(ROOT/'scripts/configure-mcp.mjs'),'--root',str(directory),'--for-install'],cwd=ROOT,check=True)
digest=hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.zip.sha256').write_text(digest+'  '+target.name+'\n')
print(json.dumps({'archive':str(target),'directory':str(directory),'files':len(set(files))+2,'sha256':digest},ensure_ascii=False))
