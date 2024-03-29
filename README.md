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

## AWS config

This tool assumes you have `~/.aws/config` and `~/.aws/credentials` setup.

### config

```ini
[default]
region=us-east-1
output=json
```

### credentials

```ini
[default]
aws_access_key_id=YOURAWSACCESSKEY
aws_secret_access_key=YOURAWSSECRETACCESSKEY
```

## Commands

### `create`

Creates the S3 bucket, website, and Bucket Policy. This will use the current working directory's current git branch to name the bucket.

```bash
$ sandbox create
Branch: current-branch-name
Bucket: my-project-current-branch-name-sandbox
Region: your-aws-region
URL: http://my-project-current-branch-name-sandbox.s3.amazonaws.com/optional/folder/prefix/
Sandbox Created!
```

### `deploy`

Sync files to S3. This will copy your `srcDir` files to the sandbox S3 bucket. If no files have changed then nothing will be uploaded.

```bash
$ sandbox deploy
⠋ Uploading Files
Sandbox Deployed!
```

### `remove | rm [name] [branch]`

Remove all uploaded files and delete the S3 Bucket. Arguments can be passed to remove a sandbox globally.

#### Arguments

- `name` - Optional. Name of the name, from `package.json`.
- `branch` - Optional. Name of Git branch.

```bash
$ sandbox remove
⠋ Removing Sandbox
Sandbox Removed!

$ sandbox remove another-project another-branch-name
⠋ Removing Sandbox
Sandbox Removed!
```

### `info [name] [branch]`

Display info about the current branch's sandbox. Arguments can be passed to look up sandbox information globally.

#### Arguments

- `name` - Optional. Name of the name, from `package.json`.
- `branch` - Optional. Name of Git branch.

```bash
# No sandbox created.
$ sandbox info
Sandbox Not Created. Run `sandbox create`

# Sandbox created
$ sandbox info
Branch: current-branch-name
Bucket: my-project-current-branch-name-sandbox
Region: your-aws-region
URL: http://my-project-current-branch-name-sandbox.s3-website.your-aws-region.amazonaws.com/optional/folder/prefix/

# Sandbox created
$ sandbox info another-project another-branch-name
Branch: another-branch-name
Bucket: another-project-another-branch-name-sandbox
Region: your-aws-region
URL: http://my-project-another-branch-name-sandbox.s3-website.your-aws-region.amazonaws.com/optional/folder/prefix/
```

### `list | ls`

List all active/created sandboxes.

```bash
# No sandbox created.
$ sandbox ls
⠋ Listing Sandboxes

my-project
  current-branch-name

another-project
  another-branch-name
```

### `open [repo] [branch]`

Open the sandbox URL in a browser.

```bash
# No sandbox created.
$ sandbox open
```
