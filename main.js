async function translate(text, from, to, options) {
    const { config, detect, setResult, utils } = options;
    const { http } = utils;
    const { fetch, Body, ResponseType } = http;

    // 檢查必要的配置
    if (!config.api_key) {
        throw new Error("Please configure API Key first");
    }

    // 解析其他參數
    let additionalParams = {};
    try {
        additionalParams = config.parameters ? JSON.parse(config.parameters) : { temperature: 0.1 };
    } catch (e) {
        console.error('Failed to parse parameters:', e);
        additionalParams = { temperature: 0.1 };
    }

    // 替換變數的函數
    const replaceVariables = (template) => {
        if (!template) return template;
        return template
            .replace(/\$text/g, text)
            .replace(/\$from/g, from)
            .replace(/\$to/g, to)
            .replace(/\$detect/g, detect || from);
    };

    // 準備對話消息
    const messages = [
        {
            role: "system",
            content: replaceVariables(config.system_prompt) ||
                    `You are a translator. Translate the following text from ${from} to ${to}. Only return the translated text, without any explanations or additional information.`
        }
    ];

    // 添加用戶消息
    messages.push({
        role: "user",
        content: config.user_prompt ? replaceVariables(config.user_prompt) : text
    });

    // 判斷是否使用流式輸出
    const useStream = config.use_stream !== "false";
    /* let debugInfo = `Mode: ${useStream ? 'Streaming' : 'Non-streaming'}\n`;
    debugInfo += `Parameters: ${JSON.stringify(additionalParams, null, 2)}\n`;
    debugInfo += `Messages: ${JSON.stringify(messages, null, 2)}\n`; */

    try {
        const response = await fetch("https://api.cohere.com/v2/chat", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "Authorization": `Bearer ${config.api_key}`
            },
            body: Body.json({
                model: config.model || "command-r-plus-08-2024",
                messages,
                stream: useStream,
                ...additionalParams
            }),
            responseType: useStream ? ResponseType.Text : ResponseType.JSON
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // debugInfo += `Response status: ${response.status}\n`;

        // 非流式輸出
        if (!useStream) {
            // debugInfo += `Response data: ${JSON.stringify(response.data, null, 2)}\n`;
            const result = response.data?.message?.content?.[0]?.text;
            if (result) {
                return result; // + "\n\n[Debug Info]\n" + debugInfo;
            }
            throw new Error("Invalid response format");
        }

        // 流式輸出
        let result = "";
        // debugInfo += `Raw response data: ${response.data}\n`;
        const lines = response.data.split('\n');
        
        // debugInfo += `Total lines: ${lines.length}\n`;
        for (const line of lines) {
            if (!line.trim()) {
                // debugInfo += `Empty line\n`;
                continue;
            }
            
            try {
                const data = JSON.parse(line);
                // debugInfo += `Parsed data: ${JSON.stringify(data)}\n`;
                
                if (data.type === "content-delta" && data.delta?.message?.content?.text) {
                    const newText = data.delta.message.content.text;
                    result += newText;
                    // debugInfo += `Added text: ${newText}\n`;
                    if (setResult) {
                        setResult(result);
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
            } catch (e) {
                // debugInfo += `Parse error: ${e.message} for line: ${line}\n`;
                continue;
            }
        }

        if (!result) {
            throw new Error("No result generated"); // \nDebug Info:\n${debugInfo}
        }

        // 最後一次更新，包含完整的調試信息
        if (setResult) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setResult(result); // + "\n\n[Debug Info]\n" + debugInfo
        }
        return result; // + "\n\n[Debug Info]\n" + debugInfo;
    } catch (error) {
        throw new Error(`Translation failed: ${error.message}`); // \nDebug Info:\n${debugInfo}
    }
} 