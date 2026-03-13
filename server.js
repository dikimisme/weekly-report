// server.js - AI周报生成器后端代理（百度千帆API）
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());                    // 解决跨域
app.use(express.json());            // 解析JSON请求体
app.use(express.static('public'));  // 托管前端静态文件

// ================= 配置区域 =================
const BAIDU_API_KEY = process.env.BAIDU_TOKEN || 'YOUR_BEARER_TOKEN_HERE';
// 百度千帆API端点（使用deepseek-v3.1-250821模型，可按需修改）
const QIANFAN_URL = 'https://qianfan.baidubce.com/v2/chat/completions';
const MODEL_NAME = 'deepseek-v3.1-250821';  // 或其他模型如 ernie-4.0-8k-latest

// 系统提示词：指导AI生成专业周报
const SYSTEM_PROMPT = `你是一位资深的行政助理，需要将员工提交的零散工作记录，整理成一份逻辑清晰、语言专业、重点突出的周报。
请根据用户提供的本周每日工作记录（每条记录前标注了星期），生成一份简洁、专业的周报。
要求：
1.必须基于原始记录：所有润色和重组都必须严格依据用户提供的原始工作记录。不得添加任何原始记录中未提及的任务或活动。如果原始记录中包含非正式表达，请用正式、专业的语言重新表述其实际含义，但需确保转化后的内容与原意相关联。  
2.整合润色：将相似或相关的工作合并，使用流畅的商务语言重新组织，但不要遗漏任何原始记录。  
3.价值体现：在保留原始事实的基础上，适当强调工作成果、解决的问题或产生的价值。例如，如果原始记录是“修改文档”，可以润色为“完成XX文档修订，确保信息准确性”。  
4.补充连接：在内容之间添加适当的过渡句，使周报读起来像连贯的叙述，而非清单。  
5.结构要求：  
   - 以“【本周工作汇总】”开头。  
   - 按时间顺序（周一至周日）分段，每天的内容可包含多条，用“-”列表呈现。  
   - 如果某天无记录，则省略该天。  
   - 结尾加上“以上为本周主要工作，请领导审阅。”  
6. 风格：正式、简洁、积极，避免口语化或冗余描述，但必须让读者能从周报中看出原始记录的基本轮廓。 `;

// ================= API路由 =================
app.post('/api/generate', async (req, res) => {
    const { days } = req.body;

    // 验证输入：必须是一个包含7个元素的数组（周一至周日）
    if (!Array.isArray(days) || days.length !== 7) {
        return res.status(400).json({ error: '请提供包含7天记录的数组（周一至周日）' });
    }

    // 检查是否至少有一项非空
    const hasContent = days.some(day => day && day.trim() !== '');
    if (!hasContent) {
        return res.status(400).json({ error: '至少填写一天的工作内容' });
    }

    // 构建用户消息：拼接非空日期记录
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const userEntries = [];
    for (let i = 0; i < days.length; i++) {
        const content = days[i]?.trim();
        if (content) {
            userEntries.push(`${weekdays[i]}：${content}`);
        }
    }
    const userContent = userEntries.join('\n');

    try {
        // 调用百度千帆API
        const response = await axios.post(
            QIANFAN_URL,
            {
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userContent }
                ],
                temperature: 0.3,          // 控制创造性，数值越低越稳定
                max_tokens: 1024,           // 限制生成长度
                top_p: 0.9
            },
            {
                headers: {
                    'Authorization': `Bearer ${BAIDU_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000               // 15秒超时
            }
        );

        // 提取AI生成的周报内容
        const aiMessage = response.data?.choices?.[0]?.message?.content;
        if (!aiMessage) {
            throw new Error('API返回数据格式异常');
        }

        // 返回成功结果
        res.json({ result: aiMessage.trim() });

    } catch (error) {
        console.error('调用百度千帆API失败:', error.message);
        // 根据错误类型返回友好信息
        let errorMessage = '生成失败，请稍后重试';
        if (error.code === 'ECONNABORTED') {
            errorMessage = '请求超时，请稍后重试';
        } else if (error.response) {
            // 千帆返回的错误信息
            errorMessage = error.response.data?.error?.message || `API错误 (${error.response.status})`;
        }
        res.status(500).json({ error: errorMessage });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
    console.log(`⚠️  注意: 当前使用的Token: ${BAIDU_API_KEY === 'YOUR_BEARER_TOKEN_HERE' ? '【占位符】请立即替换！' : '已设置'}`);
});