#!/usr/bin/env node

const { program } = require('commander');
const { red, blue, green } = require('chalk');
const branch = require('git-branch');
const slugify = require('slugify');
const readPkg = require('read-pkg');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const s3 = require('@auth0/s3');
const ora = require('ora');

let _s3 = new S3();

let client = s3.createClient({
    s3Client: _s3
});

const validateBucket = async (bucketName) => {
    try {
        let data = await _s3
            .headBucket({
                Bucket: bucketName
            })
            .promise();
        return data;
    } catch (e) {
        return false;
    }
};

const listSandboxes = async () => {
    try {
        let allBuckets = await _s3.listBuckets().promise();
        let list = allBuckets.Buckets.filter((bucket) => bucket.Name.includes('sandbox'));
        for (let bucket of list) {
            let tags = { TagSet: [] };
            try {
                tags = await _s3.getBucketTagging({ Bucket: bucket.Name }).promise();
            } catch (err) {
                tags = { TagSet: [] };
            }

            bucket.tags = tags.TagSet.reduce((obj, tagset) => {
                obj[tagset.Key] = tagset.Value;
                return obj;
            }, {});
        }
        return list;
    } catch (err) {
        console.error(err);
        return false;
    }
};

const createBucket = async (bucketName, projectName) => {
    try {
        await _s3
            .createBucket({
                Bucket: bucketName,
                ACL: 'public-read'
            })
            .promise();

        await _s3
            .putBucketPolicy({
                Bucket: bucketName,
                Policy: `{
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "AddPerm",
                        "Effect": "Allow",
                        "Principal": {
                            "AWS": "*"
                        },
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::${bucketName}/*"
                    }
                ]
            }`
            })
            .promise();

        await _s3
            .putBucketWebsite({
                Bucket: bucketName,
                ContentMD5: '',
                WebsiteConfiguration: {
                    ErrorDocument: {
                        Key: 'index.html'
                    },
                    IndexDocument: {
                        Suffix: 'index.html'
                    }
                }
            })
            .promise();
        await _s3
            .putBucketTagging({
                Bucket: bucketName,
                Tagging: {
                    TagSet: [
                        {
                            Key: 'project',
                            Value: projectName
                        }
                    ]
                }
            })
            .promise();
    } catch (e) {
        throw new Error(e);
    }
};

const removeBucket = async (bucketName) => {
    try {
        const deleter = client.deleteDir({
            Bucket: bucketName
        });
        const spinner = ora('Removing Sandbox').start();
        deleter.on('error', (err) => {
            spinner.stop();
            console.error('unable to sync:', err.stack);
        });
        deleter.on('end', async () => {
            await _s3
                .deleteBucketWebsite({
                    Bucket: bucketName
                })
                .promise();

            await _s3
                .deleteBucketPolicy({
                    Bucket: bucketName
                })
                .promise();

            await _s3
                .deleteBucketTagging({
                    Bucket: bucketName
                })
                .promise();

            await _s3
                .deleteBucket({
                    Bucket: bucketName
                })
                .promise();
            spinner.stop();
            console.log(green('Sandbox Removed!'));
        });
    } catch (e) {
        throw new Error(e);
    }
};

slugify.extend({ '.': '-' });
const slugOpts = {
    lower: true,
    strict: true
};

// S3 limits the max length of a bucket name to 63 chars.
// This will format the name to account for that limit.
const formatBucketName = (projName, branchName) => {
    let formattedName = [projName, branchName, 'sandbox'].join('-');
    if (formattedName.length <= 63) {
        // If our bucket name is <= 63 chars use it.
        return formattedName;
    }
    let remainingChars = 63 - (projName.length + 'sandbox'.length);
    let shortBranchName = branchName.substr(0, remainingChars - 3);
    return [projName, shortBranchName, 'sandbox'].join('-');
};

const getInfo = async (repo, branchName) => {
    let pkg = { name: repo, sandbox: { srcDir: '', prefix: '' } };
    try {
        pkg = await readPkg();
    } catch (e) {
        pkg = pkg;
    }

    let sandboxSettings = pkg.sandbox || { srcDir: '', prefix: '' };
    let baseBranchName = branchName || (await branch());
    let safeBranchName = slugify(baseBranchName, slugOpts);
    let safeProjName = slugify(repo || pkg.name, slugOpts);
    let bucketName = formatBucketName(safeProjName, safeBranchName);
    let srcDir = sandboxSettings.srcDir === '.' ? process.cwd() : path.relative(process.cwd(), sandboxSettings.srcDir);
    let hasBucket = await validateBucket(bucketName);
    let hasSrcDir = fs.existsSync(srcDir);

    return {
        baseBranchName,
        safeBranchName,
        projectName: pkg.name,
        safeProjName,
        bucketName,
        srcDir,
        hasBucket,
        hasSrcDir,
        prefix: sandboxSettings.prefix,
        getUrl: () => {
            return `http://${bucketName}.s3-website.${_s3.config.region}.amazonaws.com/${sandboxSettings.prefix || ''}`;
        }
    };
};

const logInfo = async (repo, branchName) => {
    let { baseBranchName, bucketName, getUrl } = await getInfo(repo, branchName);
    console.log(`Branch: ${blue(baseBranchName)}`);
    console.log(`Bucket: ${blue(bucketName)}`);
    console.log(`Region: ${blue(_s3.config.region)}`);
    console.log(`URL: ${blue(getUrl())}`);
};

program
    .command('create')
    .description('setup a sandbox for current branch')
    .action(async () => {
        try {
            let spinner = ora('Checking Sandbox').start();
            let { baseBranchName, hasSrcDir, hasBucket, bucketName, getUrl, projectName } = await getInfo();
            if (!hasBucket) {
                spinner.color = 'yellow';
                spinner.text = 'Creating Sandbox';
                await createBucket(bucketName, projectName);
            }
            spinner.stop();
            await logInfo();
            console.log(green(`Sandbox Created!`));
        } catch (e) {
            console.log(red(e.message));
        }
    });

program
    .command('deploy')
    .description('deploy built application to sandbox')
    .action(async () => {
        try {
            let { baseBranchName, hasSrcDir, hasBucket, bucketName, prefix } = await getInfo();
            if (!hasBucket) {
                throw new Error('Sandbox Not Created. Run `sandbox create`');
            }
            if (!hasSrcDir) {
                throw new Error('No Source Directory. Build your app and try again.');
            }
            const { srcDir } = await getInfo();

            const uploader = client.uploadDir({
                localDir: srcDir,
                s3Params: {
                    Prefix: prefix,
                    Bucket: bucketName,
                    ACL: 'public-read'
                }
            });

            const spinner = ora('Uploading Files').start();

            uploader.on('error', function (err) {
                spinner.stop();
                console.error('unable to sync:', err.stack);
            });

            uploader.on('end', function () {
                spinner.stop();
                console.log(green('Sandbox Deployed!'));
            });
        } catch (e) {
            console.log(red(e.message));
        }
    });

program
    .command('remove [repo] [branchName]')
    .description('remove deployed sandbox')
    .action(async (repo, branchName) => {
        try {
            let { baseBranchName, hasSrcDir, hasBucket, bucketName } = await getInfo(repo, branchName);
            if (!hasBucket) {
                throw new Error('Sandbox Not Created. Run `sandbox create`');
            }
            await removeBucket(bucketName);
        } catch (e) {
            console.log(red(e.message));
        }
    });

program
    .command('ls')
    .description('list active sandboxes')
    .action(async () => {
        try {
            let spinner = ora('Listing Sandboxes').start();
            let list = await listSandboxes();
            if (!list.length) {
                console.log(red('No Active Sandboxes'));
                return;
            }
            let groups = list.reduce((obj, bucket) => {
                let group = bucket.tags.project || 'unknown';
                if (!obj[group]) obj[group] = [];
                obj[group].push(bucket.Name.replace('-sandbox', '').replace(slugify(group) + '-', ''));
                return obj;
            }, {});
            spinner.stop();
            console.log('\n');
            Object.keys(groups).forEach((group) => {
                console.log(green(group));
                groups[group].forEach((bucket) => console.log('  ' + blue(bucket)));
                console.log('\n');
            });
        } catch (e) {
            console.log(red(e.message));
        }
    });

program
    .command('info [repo] [branchName]')
    .description('Get info about current branch sandbox')
    .action(async (repo, branchName) => {
        try {
            let { baseBranchName, hasSrcDir, hasBucket, bucketName, prefix, getUrl } = await getInfo(repo, branchName);
            if (process.env.CI) {
                return {
                    baseBranchName,
                    hasSrcDir,
                    hasBucket,
                    bucketName,
                    prefix,
                    url: getUrl()
                };
            }
            if (!hasBucket) {
                throw new Error('Sandbox Not Created. Run `sandbox create`');
            }
            await logInfo(repo, branchName);
        } catch (e) {
            console.log(red(e.message));
        }
    });

program.version(require('./package.json').version, '-v, --version').parse(process.argv);
