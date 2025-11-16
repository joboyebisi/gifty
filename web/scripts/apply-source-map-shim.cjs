const fs = require("fs");
const path = require("path");

function applyShim() {
  try {
    const projectRoot = path.join(__dirname, "..");
    const shimSource = path.join(projectRoot, "webpack-source-map-shim.js");
    const targetDir = path.join(
      projectRoot,
      "node_modules",
      "next",
      "dist",
      "compiled",
      "source-map"
    );
    const targetFile = path.join(targetDir, "index.js");

    if (!fs.existsSync(shimSource)) {
      console.warn(
        "[source-map-shim] Shim source not found. Skipping shim application."
      );
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const shimContent = fs.readFileSync(shimSource, "utf8");
    fs.writeFileSync(targetFile, shimContent, "utf8");

    console.log(
      "[source-map-shim] Applied shim to",
      targetFile.replace(projectRoot, ".")
    );
  } catch (err) {
    console.error("[source-map-shim] Failed to apply shim:", err);
    // Do not fail the install process, but log the failure for troubleshooting
  }
}

applyShim();

