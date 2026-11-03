"""Check generated plugin contents without copying a developer's runtime or data."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile


class PluginPackageTests(unittest.TestCase):
    def test_clean_distribution_includes_uv_and_drops_old_files(self):
        scratch = Path(__file__).resolve().parents[1] / '.test-tmp'
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            root = Path(temporary)
            (root / 'scripts').mkdir()
            source = Path(__file__).resolve().parents[1] / 'scripts/package_plugin.py'
            shutil.copyfile(source, root / 'scripts/package_plugin.py')
            (root / '.codex-plugin').mkdir()
            (root / '.codex-plugin/plugin.json').write_text(json.dumps({'version': '2.3.4'}))
            names = ['.mcp.json', '.env.example', 'package.json', 'package-lock.json',
                     'requirements.txt', 'uv.toml', 'README.md', 'LICENSE', 'start.bat', 'start.sh']
            for name in names:
                (root / name).write_text('fixture', encoding='utf-8')
            (root / 'marketplace.example.json').write_text('{"name":"test"}')
            for name in ['data/private.json', '.runtime/python.json', '.uv-cache/private.txt',
                         'config/private.json', '.env', '.venv/private.txt']:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('private')
            directory = root / 'dist/financial-agent'
            directory.mkdir(parents=True)
            (directory / 'stale.txt').write_text('old build')
            result = subprocess.run([sys.executable, str(root / 'scripts/package_plugin.py')],
                                    cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((directory / 'stale.txt').exists())
            with ZipFile(root / 'dist/financial-agent-2.3.4.zip') as archive:
                self.assertIsNone(archive.testzip())
                paths = archive.namelist()
                self.assertIn('uv.toml', paths)
                self.assertIn('.agents/plugins/marketplace.json', paths)
                self.assertFalse(any(path.startswith(('data/', '.runtime/', '.uv-cache/', '.venv/', 'config/')) for path in paths))
                self.assertNotIn('.env', paths)


if __name__ == '__main__':
    unittest.main()
