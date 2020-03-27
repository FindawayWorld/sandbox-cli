# @findaway/sandbox-cli

Command line tool to manage sandboxed web apps. This will create a new S3 bucket and static website to view the sandbox.

## Install

You should install this tool globally to allow use in any project directory.

```bash
# Yarn
yarn global add @findaway/sandbox-cli

# NPM
npm install -g @findaway/sandbox-cli
```

## Project Setup

To use `sandbox` with your project you need to add some config values to your `package.json`

- `srcDir` - This is the directory of files to deploy to your sandbox.
- `prefix` - (optional) Directory to place files in S3 bucket.

```json
{
    "sandbox": {
        "srcDir": "path/to/files/to/upload/",
        "prefix": "optional/folder/prefix/"
    }
}
```

## Commands

### `create`

Creates the S3 bucket, website, and Bucket Policy. This will use the current working directory's current git branch to name the bucket.

```bash
$ sandbox create
Current Branch: current-branch-name
Create Bucket: my-project-current-branch-name-sandbox
Sandbox active: http://my-project-current-branch-name-sandbox.s3.amazonaws.com/optional/folder/prefix/index.html
```

### `deploy`

Sync files to S3. This will copy your `srcDir` files to the sandbox S3 bucket. If no files have changed then nothing will be uploaded.

```bash
$ sandbox deploy
progress [========================================] 100% | ETA: 0s | 281634799/2841169
Sandbox Deployed!
```

### `remove`

Remove all uploaded files and delete the S3 Bucket.

```bash
$ sandbox remove
progress [========================================] 100% | ETA: 0s | 281634799/2841169
Sandbox Removed!
```

### `info`

Display info about the current branch's sandbox.

```bash
# No sandbox created.
$ sandbox info
Branch: txt-align-utils
Bucket: gateway-txt-align-utils-sandbox
Is Active?: No

# Sandbox created
$ sandbox info
Branch: current-branch-name
Bucket: my-project-current-branch-name-sandbox
Is Active?: Yes
URL: http://my-project-current-branch-name-sandbox.s3.amazonaws.com/optional/folder/prefix/index.html
```
