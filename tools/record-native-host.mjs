import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

const expectedArch = process.argv[2];
if (!expectedArch) {
  throw new Error("Pass the expected Node architecture, for example x64 or arm64.");
}

const platform = process.platform;
const architecture = process.arch;
if (architecture !== expectedArch) {
  throw new Error(`Expected ${expectedArch}, but the native Node process is ${architecture}.`);
}

function command(name, args) {
  return execFileSync(name, args, { encoding: "utf8" }).trim();
}

let operatingSystem;
let platformBuild;
if (platform === "win32") {
  operatingSystem = command("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture | ConvertTo-Json -Compress",
  ]);
  platformBuild = `Windows kernel ${os.release()}`;
} else if (platform === "darwin") {
  operatingSystem = `${command("sw_vers", ["-productName"])} ${command("sw_vers", ["-productVersion"])}`;
  platformBuild = `macOS build ${command("sw_vers", ["-buildVersion"])}; Darwin kernel ${os.release()}`;
} else if (platform === "linux") {
  const release = Object.fromEntries(
    readFileSync("/etc/os-release", "utf8")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/u.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/gu, "")];
      }),
  );
  operatingSystem = `${release.PRETTY_NAME ?? release.NAME ?? "Linux"} (${release.VERSION_ID ?? "version unknown"})`;
  platformBuild = `Linux kernel ${os.release()}; machine ${command("uname", ["-m"])}`;
} else {
  throw new Error(`Unsupported native CI platform: ${platform}`);
}

console.log(`Native OS: ${operatingSystem}`);
console.log(`Platform build: ${platformBuild}`);
console.log(`Node process platform/architecture: ${platform}/${architecture}`);
console.log(`Node OS version/release: ${os.version()} / ${os.release()}`);
