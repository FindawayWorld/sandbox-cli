#!/usr/bin/env node

const { program } = require('commander');
const {red, blue, green} = require('chalk');
const branch = require('git-branch');
const slugify = require('slugify');
const readPkg = require('read-pkg');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const s3 = require('@auth0/s3');
const cliProgress = require('cli-progress');

let _s3 = new S3();

let client = s3.createClient({
    s3Client: _s3
});

const validateBucket = async (bucketName) => {
    try {
        let data = await _s3.headBucket({
            'Bucket': bucketName
        }).promise();
        return data;
    } catch (e) {
        return false;
    }
};

const createBucket = async (bucketName) => {
    try {
        await _s3.createBucket({
            Bucket: bucketName,
            ACL: 'public-read'
        }).promise();

        await _s3.putBucketPolicy({
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
        }).promise();

        await _s3.putBucketWebsite({
            Bucket: bucketName,
            ContentMD5: '',
            WebsiteConfiguration: {
                ErrorDocument: {
                    Key: 'index.html',
                },
                IndexDocument: {
                    Suffix: 'index.html',
                },
            },
        }).promise();

    } catch (e) {
        throw new Error(e);
    }
};

const removeBucket = async (bucketName) => {
   try {
        const deleter = client.deleteDir({
            Bucket: bucketName
        });
        const deleteBar = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);
        deleteBar.start(deleter.progressTotal, 0);
        deleter.on('error', (err) => {
            deleteBar.stop();
            console.error("unable to sync:", err.stack);
        });
        deleter.on('progress', () => {
            deleteBar.setTotal(deleter.progressTotal);
            deleteBar.update(deleter.progressAmount);
        });
        deleter.on('end', async () => {
            deleteBar.stop();
            await _s3.deleteBucketWebsite({
                Bucket: bucketName,
            }).promise();

            await _s3.deleteBucketPolicy({
                Bucket: bucketName,
            }).promise();

            await _s3.deleteBucket({
                Bucket: bucketName
            }).promise();
            Promise.resolve();
        });
   } catch (e) {
       throw new Error(e);
   }
};

slugify.extend({'.': '-'})
const slugOpts = {
    lower: true,
    strict: true
};

const getInfo = async () => {
    let pkg = await readPkg();
    let baseBranchName = await branch();
    let safeBranchName = slugify(baseBranchName, slugOpts);
    let safeProjName = slugify(pkg.name, slugOpts);
    let bucketName = [safeProjName, safeBranchName, 'sandbox'].join('-');
    let srcDir = path.relative(process.cwd(), pkg.sandbox.srcDir);
    let hasBucket = await validateBucket(bucketName);
    let hasSrcDir = fs.existsSync(srcDir);

    return {
        baseBranchName,
        safeBranchName,
        safeProjName,
        bucketName,
        srcDir,
        hasBucket,
        hasSrcDir,
        prefix: pkg.sandbox.prefix,
        getUrl: () => {
            return s3.getPublicUrlHttp(bucketName, `${pkg.sandbox.prefix}index.html`)
        }
    }
};

program
    .command('create')
    .description('setup a sandbox for current branch')
    .action(async () => {
        try {

            let {baseBranchName, hasSrcDir, hasBucket, bucketName, getUrl} = await getInfo();

            console.log(`Current Branch: ${blue(baseBranchName)}`);

            if (!hasBucket) {
                console.log(blue(`Create Bucket: ${bucketName}`));
                let data = await createBucket(bucketName);
            }

            console.log(`Sandbox active: ${blue(getUrl())}`);

        } catch (e) {
            console.log(red(e.message))
        }
    });

program
    .command('deploy')
    .description('deploy built application to sandbox')
    .action(async () => {
        try {
            let {baseBranchName, hasSrcDir, hasBucket, bucketName, prefix} = await getInfo();
            if (!hasBucket) {
                throw new Error('Sandbox Not Created. Run `sandbox create`');
            }
            if (!hasSrcDir) {
                throw new Error('No Source Directory. Build your app and try again.');
            }
            const {srcDir} = await getInfo();
            const uploadBar = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);
            const uploader = client.uploadDir({
                localDir: srcDir,
                s3Params: {
                    Prefix: prefix,
                    Bucket: bucketName,
                    ACL: 'public-read'
                }
            });
            uploadBar.start(uploader.progressTotal, 0);
            uploader.on('error', function(err) {
                uploadBar.stop();
                console.error("unable to sync:", err.stack);
            });
            uploader.on('progress', function() {
                uploadBar.setTotal(uploader.progressTotal);
                uploadBar.increment(uploader.progressAmount);
            });
            uploader.on('end', function() {
                uploadBar.stop();
                console.log(green('Sandbox Deployed!'));
            });
        } catch (e) {
            console.log(red(e.message))
        }
    });

program
    .command('remove')
    .description('remove deployed sandbox')
    .action(async () => {
        try {
            let {baseBranchName, hasSrcDir, hasBucket, bucketName} = await getInfo();
            if (!hasBucket) {
                throw new Error('Sandbox Not Created. Run `sandbox create`');
            }
            await removeBucket(bucketName);
            console.log(green('Sandbox Removed!'));
        } catch (e) {
            console.log(red(e.message))
        }
    });

program
    .command('info')
    .description('Get info about current branch sandbox')
    .action(async () => {
        let {baseBranchName, hasSrcDir, hasBucket, bucketName, prefix, getUrl} = await getInfo();
        console.log(`Branch: ${blue(baseBranchName)}`);
        console.log(`Bucket: ${blue(bucketName)}`);
        console.log(`Is Active?: ${hasBucket ? green('Yes') : red('No')}`);
        if (hasBucket) {
            console.log(`URL: ${getUrl()}`);
        }
    });

program.parse(process.argv);