import { spawn } from 'child_process';
import path from "path";
import { pluginRoot } from "../model/path.js";

class DouyinParser {
    constructor(pythonPath = 'python3', scriptPath = path.join(pluginRoot, 'utils', 'douyin_parser_standalone.py')) {
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
                    windowsHide: true
                });

                let stdout = '';
                let stderr = '';

                // 设置超时
                const timeout = setTimeout(() => {
                    child.kill();
                    reject(new Error('Python script execution timeout (30s)'));
                }, 30000);

                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                child.stderr.on('data', (data) => {
                    stderr += data.toString();
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

    /**
     * 批量解析多个文本
     * @param {string[]} texts - 文本数组
     * @returns {Promise<Object[]>} 解析结果数组
     */
    async parseMultiple(texts) {
        const results = [];
        for (const text of texts) {
            try {
                const result = await this.parse(text);
                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    input: text
                });
            }
        }
        return results;
    }
}

export const Douyin_parser = new DouyinParser();