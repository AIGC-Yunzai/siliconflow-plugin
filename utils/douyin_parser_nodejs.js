import { execSync } from 'child_process';
import path from "path";
import { pluginRoot } from "../model/path.js";

class DouyinParser {
    constructor(pythonPath = 'python3', scriptPath = path.join(pluginRoot, 'utils', 'douyin_parser_standalone.py')) {
        this.pythonPath = pythonPath;
        this.scriptPath = scriptPath;
    }

    /**
     * 解析抖音链接
     * @param {string} text - 包含抖音链接的文本
     * @returns {Promise<Object>} 解析结果
     */
    async parse(text) {
        return new Promise((resolve, reject) => {
            try {
                // 使用 execSync 执行 Python 脚本
                try {
                    const stdout = execSync(`${this.pythonPath} "${this.scriptPath}" "${text}"`, {
                        encoding: 'utf-8',
                        windowsHide: true,
                        timeout: 30000 // 30秒超时
                    });

                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Python script execution failed: ${error.message}`));
                }

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