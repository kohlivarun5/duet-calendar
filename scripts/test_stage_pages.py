"""Exercise Pages staging against real Git indexes, including backend fixtures."""

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("stage_pages", Path(__file__).with_name("stage_pages.py"))
stage_pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage_pages)


class StagePagesTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.git("init", "--quiet")
        self.write("index.html", "<!doctype html><title>Duet</title>")
        self.git("add", "index.html")

    def git(self, *arguments):
        return subprocess.run(["git", *arguments], cwd=self.root, check=True, capture_output=True)

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def test_publishes_website_and_existing_ads_paths_but_only_when_tracked(self):
        public = {
            "app/index.html": "redirect", "styles.css": "body{}",
            "assets/js/site.js": "void 0;", "assets/icons/icon.png": "image",
            "robots.txt": "User-agent: *", "llms.txt": "Duet",
            "sitemap.xml": "<urlset/>", "CNAME": "duetcalendar.com",
            "ads/keywords.csv": "keyword", "ads/campaign.md": "campaign reference",
        }
        for name, content in public.items():
            self.write(name, content)
        self.git("add", *public)
        self.write("assets/untracked.txt", "must not ship")
        stage_pages.stage_site(self.root)
        actual = {str(path.relative_to(self.root / "_site")) for path in (self.root / "_site").rglob("*") if path.is_file()}
        self.assertEqual(actual, {"index.html", *public})
        for name, content in public.items():
            self.assertEqual((self.root / "_site" / name).read_text(), content)

    def test_backend_keys_builds_dependencies_docs_and_dotfiles_never_publish(self):
        excluded = [
            "workers/retention-api/src/worker.mjs", "workers/retention-api/dist/index.html",
            "workers/retention-api/test/fixtures/private-key.pem",
            "node_modules/dependency/index.js", "assets/node_modules/dependency/index.js",
            "docs/proof.png", "scripts/test_stage_pages.py", ".github/workflows/deploy.yml",
            ".env", ".env.production", "assets/.env", "README.md",
        ]
        for name in excluded:
            self.write(name, "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----")
        self.git("add", "--force", *excluded)
        self.assertEqual(stage_pages.stage_site(self.root), 1)
        self.assertEqual([path.name for path in (self.root / "_site").iterdir()], ["index.html"])

    def test_credential_files_fail_without_replacing_previous_build(self):
        stage_pages.stage_site(self.root)
        self.write("assets/signing-key.p8", "secret")
        self.git("add", "assets/signing-key.p8")
        self.write("index.html", "changed")
        with self.assertRaises(stage_pages.StagingError):
            stage_pages.stage_site(self.root)
        self.assertIn("Duet", (self.root / "_site/index.html").read_text())

    def test_rebuild_removes_stale_files_from_an_earlier_output(self):
        stage_pages.stage_site(self.root)
        self.write("_site/old-backend-key.pem", "must not survive")
        stage_pages.stage_site(self.root)
        self.assertEqual([path.name for path in (self.root / "_site").iterdir()], ["index.html"])

    def test_private_key_disguised_as_public_text_fails(self):
        self.write("assets/instructions.txt", "-----BEGIN EC PRIVATE KEY-----\nsecret")
        self.git("add", "assets/instructions.txt")
        with self.assertRaises(stage_pages.StagingError):
            stage_pages.stage_site(self.root)
        self.assertFalse((self.root / "_site").exists())

    def test_tracked_symlink_cannot_copy_an_outside_file(self):
        outside = Path(self.temporary.name).parent / (self.root.name + "-outside.txt")
        outside.write_text("private")
        self.addCleanup(outside.unlink)
        link = self.root / "assets/linked.txt"
        link.parent.mkdir()
        link.symlink_to(outside)
        self.git("add", "assets/linked.txt")
        with self.assertRaises(stage_pages.StagingError):
            stage_pages.stage_site(self.root)

    def test_parent_directory_symlink_and_output_symlink_are_rejected(self):
        self.write("assets/site.js", "safe")
        self.git("add", "assets/site.js")
        (self.root / "assets/site.js").unlink()
        (self.root / "assets").rmdir()
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "site.js").write_text("unsafe")
        (self.root / "assets").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(stage_pages.StagingError):
            stage_pages.stage_site(self.root)
        (self.root / "assets").unlink()
        (self.root / "_site").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(stage_pages.StagingError):
            stage_pages.stage_site(self.root)
        self.assertEqual((outside / "site.js").read_text(), "unsafe")

    def test_escaping_paths_and_unknown_asset_types_fail_closed(self):
        for name in ["../outside.html", "/outside.html", "assets\\outside.js", "assets/unknown.bundle"]:
            with self.subTest(name=name), self.assertRaises(stage_pages.StagingError):
                stage_pages.public_path(name)


if __name__ == "__main__":
    unittest.main()
