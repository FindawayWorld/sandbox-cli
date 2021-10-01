const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);

const hasGit = (cwd) => {
    return fs.existsSync(`${cwd}/.git/HEAD`);
};

const parseBranchName = (buffer) => {
    const match = /ref: refs\/heads\/([^\n]+)/.exec(buffer.toString());
    return match ? match[1] : null;
};

const branch = async (cwd) => {
    let _cwd = cwd || process.cwd();
    try {
        if (hasGit(_cwd)) {
            let buffer = await readFile(`${_cwd}/.git/HEAD`);
            return parseBranchName(buffer);
        } else {
            throw new Error('No Git');
        }
    } catch {
        return false;
    }
};

module.exports = { branch };
