# Install a release without Git

[README](../README.md) · [Model setup](./models.md) · [Updating an installation](./local-upgrades.md)

This application includes its Pi Durable and OptChat dependencies through npm. It does not require an existing Pi installation or a customized distribution. The local demo needs Node.js 22.19+ and npm; it needs no Cloudflare account, model credentials or subscription. The first dependency installation needs internet access unless all locked packages are already cached.

## Start from a published archive

1. Open [Releases](https://github.com/kevinqz/pi-durable-agent/releases) and read the selected release's status and supported scope.
2. Download its named `pi-durable-agent-<version>.tgz` asset, `SHA256SUMS` and `release-validation.json` into the same folder. Use the named asset when checking the published checksum; GitHub's automatically generated source downloads have different bytes.
3. Verify the downloads before extraction. On macOS run `shasum -a 256 -c SHA256SUMS`; on Linux run `sha256sum -c SHA256SUMS`. Both named files must report `OK`. These hashes detect changed bytes; they do not independently authenticate a compromised release account.
4. Extract the archive into a new folder. Open a terminal in the extracted application folder containing `package.json` and run:

   ```sh
   npm ci
   npm run dev
   ```

5. Open the loopback address printed by the server, normally `http://127.0.0.1:8787`, and follow that archive's README. Keep the complete session URL, including its `#` fragment, to return to the same conversation.

The published archive and its own documentation describe one version. The repository's main branch may contain features that are not in that release. A development preview does not become operationally qualified merely because it can be downloaded.

## Keep data when updating

An archive is application source, not your session data. Local sessions live under `.wrangler/` unless you selected another state directory. Keep the old installation and state; do not extract a new release over them. Stop the old server, install the new version separately, then follow the target release's [reviewed update route](./local-upgrades.md). Missing routes are refused. There is no automatic or arbitrary-version migration.

Closing the browser leaves the local server running. Stopping that server pauses local processing until it starts again. Hosted execution has separate [Cloudflare setup and costs](./deployment.md); installing this archive does not create hosted resources or transfer a ChatGPT/Claude login.

## Verify the downloaded scope

`release-validation.json` identifies the source revision, artifact and checks performed for that release. It distinguishes an independent cached dependency install from a cold-cache network install and local synthetic tests from hosted model observations. `SHA256SUMS` includes the source archive and that validation record. Retain them together when recording the version you installed.

The runtime can start, export data, and manage local backups without Git. Developers running the cross-release check from an archive must supply the retained baseline source as described in [the update guide](./local-upgrades.md#reproduce-the-check-without-a-cloud-account).
