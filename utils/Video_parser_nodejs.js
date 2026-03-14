import { spawn } from 'child_process';
import path from "path";
import { pluginRoot } from "../model/path.js";

class DouyinParser {
    constructor(pythonPath = 'python', scriptPath = path.join(pluginRoot, 'utils', 'douyin_parser_standalone.py')) {
        this.pythonPath = pythonPath;
        this.scriptPath = scriptPath;
    }

    /**
     * 转义shell特殊字符
     * @param {string} str - 需要转义的字符串
     * @returns {string} 转义后的字符串
     */
    escapeShellArg(str) {
        if (process.platform === 'win32') {
            // Windows下的转义处理
            return '"' + str.replace(/"/g, '\\"').replace(/\\/g, '\\\\') + '"';
        } else {
            // Unix/Linux下的转义处理
            return "'" + str.replace(/'/g, "'\"'\"'") + "'";
        }
    }

    /**
     * 解析抖音链接
     * @param {string} text - 包含抖音链接的文本
     * @returns {Promise<Object>} 解析结果
     */
    async parse(text) {
        return new Promise((resolve, reject) => {
            try {
                // 使用spawn代替execSync，避免shell解析问题
                const child = spawn(this.pythonPath, [this.scriptPath, text], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true,
                    // 关键：强制设置环境变量，让Python输出UTF-8
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                });

                let stdout = '';
                let stderr = '';

                // 设置超时
                const timeout = setTimeout(() => {
                    child.kill();
                    reject(new Error('Python script execution timeout (30s)'));
                }, 30000);

                // 关键修改1：指定编码为utf8读取stdout
                child.stdout.setEncoding('utf8');
                child.stdout.on('data', (data) => {
                    stdout += data; // 不再需要toString()，已直接是utf8字符串
                });

                // 关键修改2：stderr也指定utf8编码
                child.stderr.setEncoding('utf8');
                child.stderr.on('data', (data) => {
                    stderr += data;
                });

                child.on('close', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        reject(new Error(`Python script execution failed with code ${code}: ${stderr}`));
                        return;
                    }
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse Python output: ${parseError.message}\nOutput: ${stdout}`));
                    }
                });
                child.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to start Python process: ${error.message}`));
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}

class KuaishouParser {
    constructor(pythonPath = 'python', scriptPath = path.join(pluginRoot, 'utils', 'kuaishou_parser_standalone.py')) {
        this.pythonPath = pythonPath;
        this.scriptPath = scriptPath;
    }

    async parse(text) {
        return new Promise((resolve, reject) => {
            try {
                const child = spawn(this.pythonPath, [this.scriptPath, text], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true
                });

                let stdout = '';
                let stderr = '';

                // 设置超时 30秒
                const timeout = setTimeout(() => {
                    child.kill();
                    reject(new Error('Python script execution timeout (30s)'));
                }, 30000);

                child.stdout.on('data', (data) => { stdout += data.toString(); });
                child.stderr.on('data', (data) => { stderr += data.toString(); });

                child.on('close', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        reject(new Error(`Python script execution failed with code ${code}: ${stderr}`));
                        return;
                    }
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse Python output: ${parseError.message}\nOutput: ${stdout}`));
                    }
                });

                child.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to start Python process: ${error.message}`));
                });

            } catch (error) {
                reject(error);
            }
        });
    }
}

export const Douyin_parser = new DouyinParser();
export const Kuaishou_parser = new KuaishouParser();
