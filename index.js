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
const ora = require('ora');

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
        const spinner = ora('Deleting Sandbox').start();
        deleter.on('error', (err) => {
            spinner.stop();
            console.error("unable to sync:", err.stack);
        });
        deleter.on('end', async () => {
            await _s3.deleteBucketWebsite({
                Bucket: bucketName,
            }).promise();

            await _s3.deleteBucketPolicy({
                Bucket: bucketName,
            }).promise();

            await _s3.deleteBucket({
                Bucket: bucketName
            }).promise();
            spinner.stop();
            console.log(green('Sandbox Removed!'));
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
            return `http://${bucketName}.s3-website.${_s3.config.region}.amazonaws.com/${pkg.sandbox.prefix||''}`;
        }
    }
};

const logInfo = async () => {
    let {baseBranchName, bucketName, getUrl} = await getInfo();
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
            let {baseBranchName, hasSrcDir, hasBucket, bucketName, getUrl} = await getInfo();
            if (!hasBucket) {
                spinner.color = 'yellow';
                spinner.text = 'Creating Sandbox';
                await createBucket(bucketName);
            }
            spinner.stop();
            await logInfo();
            console.log(green(`Sandbox Created!`));
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

            const uploader = client.uploadDir({
                localDir: srcDir,
                s3Params: {
                    Prefix: prefix,
                    Bucket: bucketName,
                    ACL: 'public-read'
                }
            });

            const spinner = ora('Uploading Files').start();

            uploader.on('error', function(err) {
                spinner.stop();
                console.error("unable to sync:", err.stack);
            });

            uploader.on('end', function() {
                spinner.stop();
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
        } catch (e) {
            console.log(red(e.message))
        }
    });

program
    .command('info')
    .description('Get info about current branch sandbox')
    .action(async () => {
        try {
            let {baseBranchName, hasSrcDir, hasBucket, bucketName, prefix, getUrl} = await getInfo();
            if (!hasBucket) {
                throw new Error('Sandbox Not Created. Run `sandbox create`');
            }
            await logInfo();
        } catch (e) {
            console.log(red(e.message))
        }
    });

program
    .version(require('./package.json').version, '-v, --version')
    .parse(process.argv);