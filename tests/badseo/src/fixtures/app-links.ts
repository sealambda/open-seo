import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "App promotion";

// A made-up App Store id; the banner only has to be well formed.
const APP_ID = "1234567890";

const APP_SCHEMA = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "BadSEO",
  operatingSystem: "iOS",
  applicationCategory: "UtilitiesApplication",
})}</script>`;

function banner(content: string) {
  return `<meta name="apple-itunes-app" content="${content}">`;
}

// 28 — Smart App Banner sends every page to the home screen ---------------
const bannerArgumentIsRoot: Fixture = {
  path: "/apps/smart-banner-root",
  category: CAT,
  name: "Smart App Banner points at the home page",
  summary:
    "The banner's app-argument is the site root, although this page is deeper.",
  lesson:
    "People who open the app from this banner land on the app's start screen, not on what they were reading. Pass the page's own URL as the app-argument.",
  expectedIssues: ["malformed-smart-app-banner"],
  handler: ({ origin }) =>
    htmlResponse(
      renderPage({
        fixture: bannerArgumentIsRoot,
        title: "A Smart App Banner that forgets the page",
        metaDescription:
          "This page shows Safari's app banner, but opening the app from it drops the reader on the home screen instead of this article.",
        headExtra: `${banner(`app-id=${APP_ID}, app-argument=${origin}/`)}\n${APP_SCHEMA}`,
        bodyHtml: article({
          h1: "The banner loses your place",
          lede: "Tap Open in the banner on this page and the app starts from scratch.",
          sections: [
            {
              h2: "What app-argument is for",
              body: "Safari's Smart App Banner takes two values. The app-id says which app to promote, and the optional app-argument is a URL the app receives when someone opens it from the banner. Apple suggests passing the page's own URL, so the app can open the same article, product or search the person was looking at on the web.",
            },
            {
              h2: "Why the home page is the wrong answer",
              body: "Templates often hard-code the site root as the app-argument on every page. It works on the home page and nowhere else: a reader deep in the site switches to the app and has to find their way back to the content by hand. Generate the value per page instead, from the canonical URL the page already knows.",
            },
          ],
        }),
      }),
    ),
};

// 29 — Smart App Banner with no app markup --------------------------------
const bannerWithoutSchema: Fixture = {
  path: "/apps/banner-without-markup",
  category: CAT,
  name: "App banner without app markup",
  summary:
    "The page promotes an app with a Smart App Banner, but has no SoftwareApplication structured data.",
  lesson:
    "A page that sells an app should say so in structured data too: its name, platform, category, rating and price, in a form search engines can read.",
  expectedIssues: ["app-banner-without-app-schema"],
  handler: ({ origin, path }) =>
    htmlResponse(
      renderPage({
        fixture: bannerWithoutSchema,
        title: "An app page with no app markup",
        metaDescription:
          "This page promotes an iOS app with Safari's Smart App Banner, but tells search engines nothing about the app in structured data.",
        headExtra: banner(`app-id=${APP_ID}, app-argument=${origin}${path}`),
        bodyHtml: article({
          h1: "Search engines can't see the app",
          lede: "People on an iPhone see the banner. Crawlers only see a page.",
          sections: [
            {
              h2: "What the markup adds",
              body: "SoftwareApplication and MobileApplication are schema.org types for describing an app: its name, the operating system it runs on, its category, its rating and its price. Search engines read them from a JSON-LD block in the page, the same way they read markup for articles, products or events.",
            },
            {
              h2: "Keep it true to the store",
              body: "The values should match the store listing. A rating or price that disagrees with the App Store or Google Play is worse than none, because it misleads the people who click through. Update the markup when the listing changes, or generate it from the same data the listing uses.",
            },
          ],
        }),
      }),
    ),
};

// 30 — link to a shut-down Firebase Dynamic Link --------------------------
const firebaseDynamicLink: Fixture = {
  path: "/apps/firebase-dynamic-link",
  category: CAT,
  name: "Link to a shut-down Firebase Dynamic Link",
  summary:
    "The page's download button points at a *.page.link URL, which now returns 404.",
  lesson:
    "Firebase Dynamic Links shut down on August 25, 2025. Replace every page.link URL with a direct store link or a link on your own domain.",
  expectedIssues: ["dead-firebase-dynamic-link"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: firebaseDynamicLink,
        title: "A download link that goes nowhere",
        metaDescription:
          "The download button on this page still points at a Firebase Dynamic Link, a service that shut down in August 2025.",
        bodyHtml: `${article({
          h1: "The download button is dead",
          lede: "It looks fine. Everyone who taps it gets a 404.",
          sections: [
            {
              h2: "What happened to Dynamic Links",
              body: "Firebase Dynamic Links sent people to the right store, or into the app if they already had it, from one short URL. Google shut the service down on August 25, 2025. Every link served by it, on page.link subdomains and on custom domains alike, now returns a 404, so old buttons, emails and printed QR codes quietly stopped working.",
            },
            {
              h2: "What to use instead",
              body: "Link straight to the App Store and Google Play listings, or set up Universal Links and Android App Links on your own domain so one URL opens the app when it is installed and a web page when it is not. Search the site and your campaigns for page.link and replace each one.",
            },
          ],
        })}
<p><a href="https://badseo.page.link/get-the-app">Download the app</a></p>`,
      }),
    ),
};

// 31 — broken apple-app-site-association ----------------------------------
const brokenAasa: Fixture = {
  path: "/.well-known/apple-app-site-association",
  category: CAT,
  name: "Broken apple-app-site-association file",
  summary:
    "The iOS Universal Links file exists, but a trailing comma makes it invalid JSON.",
  lesson:
    "iOS can't read the file, so links to the site open in Safari instead of the app. Validate the JSON before you deploy it.",
  expectedIssues: ["apple-app-site-association-invalid"],
  handler: () =>
    new Response(
      `{"applinks": {"details": [{"appIDs": ["ABCDE12345.dev.badseo"], "components": [{"/": "/apps/*"}]}],}}`,
      {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    ),
};

// 32 — assetlinks.json with the wrong content type ------------------------
const brokenAssetlinks: Fixture = {
  path: "/.well-known/assetlinks.json",
  category: CAT,
  name: "assetlinks.json served as plain text",
  summary:
    "The Android App Links file is valid JSON, but it is served as text/plain.",
  lesson:
    "Android only accepts the file as application/json, so it can't verify the site's App Links and they open in the browser.",
  expectedIssues: ["assetlinks-invalid"],
  handler: () =>
    new Response(
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "dev.badseo",
            sha256_cert_fingerprints: [
              "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5",
            ],
          },
        },
      ]),
      {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    ),
};

export const appLinkFixtures: Fixture[] = [
  bannerArgumentIsRoot,
  bannerWithoutSchema,
  firebaseDynamicLink,
  brokenAasa,
  brokenAssetlinks,
];
