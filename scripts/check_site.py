"""Open docs/index.html in headless Chromium and check it works.

- screenshots at 1280 px and 390 px (light) and 1280 px (dark) into screenshots/
- no console errors, no horizontal scroll at 390 px
- chart PNG, card PNG, page PNG and CSV exports each produce a file

Needs: pip install -r requirements-dev.txt && python -m playwright install chromium
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / "docs" / "index.html").as_uri()
OUT = ROOT / "screenshots"
problems = []


def open_page(browser, width, scheme="light"):
    ctx = browser.new_context(viewport={"width": width, "height": 900}, color_scheme=scheme, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE, wait_until="networkidle")
    page.wait_for_selector(".card")
    page.wait_for_timeout(600)  # let chart animations finish
    return ctx, page, errors


def expect_file(page, selector, suffix, magic=None):
    with page.expect_download(timeout=60000) as info:
        page.locator(selector).first.click()
    path = OUT / f"export-{info.value.suggested_filename}"
    info.value.save_as(path)
    data = path.read_bytes()
    ok = path.name.endswith(suffix) and len(data) > 500 and (magic is None or data.startswith(magic))
    print(f"{'ok  ' if ok else 'FAIL'} export {selector}: {path.name} ({len(data) // 1024} KB)")
    if not ok:
        problems.append(f"export {selector} produced a bad file")


def main() -> int:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, scheme in [(1280, "light"), (390, "light"), (1280, "dark")]:
            ctx, page, errors = open_page(browser, width, scheme)
            shot = OUT / f"dashboard-{width}-{scheme}.png"
            page.screenshot(path=shot, full_page=True)
            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            cards = page.locator(".card").count()
            print(f"ok   screenshot {shot.name} ({cards} cards, horizontal overflow {overflow}px)")
            if overflow > 0:
                problems.append(f"horizontal scroll at {width}px")
            if width == 1280 and scheme == "light":
                expect_file(page, "[data-chart-png]", ".png", b"\x89PNG")
                expect_file(page, "[data-card-png]", ".png", b"\x89PNG")
                expect_file(page, "#export-page", ".png", b"\x89PNG")
                expect_file(page, "#download-csv", ".csv")
                # Clicking a key message must filter the cards.
                page.locator(".km").first.click()
                page.wait_for_timeout(300)
                filtered = page.locator(".card").count()
                print(f"{'ok  ' if filtered < cards else 'FAIL'} key message filter: {cards} -> {filtered} cards")
                if filtered >= cards:
                    problems.append("key message click did not filter cards")
            for e in errors:
                problems.append(f"console error at {width}px {scheme}: {e}")
            ctx.close()
        browser.close()
    for msg in problems:
        print(f"PROBLEM: {msg}")
    print("PASSED" if not problems else "FAILED")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
