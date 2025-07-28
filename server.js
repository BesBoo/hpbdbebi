const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = 3000;

// Tăng timeout cho request
app.use((req, res, next) => {
    req.setTimeout(60000); // 60 giây
    res.setTimeout(60000);
    next();
});

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    next();
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Test route
app.get('/test', (req, res) => {
    res.json({ 
        message: 'Server is working!', 
        timestamp: new Date().toISOString(),
        method: 'GET'
    });
});

// Test POST route (không gửi email thật)
app.post('/test-post', (req, res) => {
    console.log('📝 Test POST request received');
    console.log('Body:', req.body);
    
    res.json({
        message: 'POST request thành công!',
        receivedData: req.body,
        timestamp: new Date().toISOString()
    });
});

// Test email fake (không gửi thật)
app.post('/test-email-fake', (req, res) => {
    console.log('📧 Fake email test');
    console.log('Request body:', req.body);
    
    // Giả lập delay như gửi email thật
    setTimeout(() => {
        res.json({
            success: true,
            message: 'Email fake đã được "gửi" thành công!',
            fakeMessageId: 'fake-' + Date.now(),
            timestamp: new Date().toISOString()
        });
    }, 2000); // Delay 2 giây
});

// Route gửi mail với xử lý lỗi tốt hơn
app.post('/send-email', async (req, res) => {
    console.log('📧 === EMAIL REQUEST START ===');
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    
    const { subject, message } = req.body;

    // Validate input
    if (!subject || !message) {
        console.log('❌ Missing required fields');
        return res.status(400).json({ 
            success: false, 
            message: 'Thiếu subject hoặc message' 
        });
    }

    try {
        console.log('🔧 Creating email transporter...');
        
        // Cấu hình transporter với timeout
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'tranduyduc9679@gmail.com',
                pass: 'irpc veyt lsrk utwt'
            },
            debug: true,
            logger: true,
            connectionTimeout: 60000, // 60 giây
            greetingTimeout: 30000,   // 30 giây
            socketTimeout: 60000      // 60 giây
        });
        

        console.log('✅ Transporter created, verifying connection...');
        
        // Test connection với timeout
        const verifyPromise = transporter.verify();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SMTP verification timeout')), 30000)
        );
        
        await Promise.race([verifyPromise, timeoutPromise]);
        console.log('✅ SMTP connection verified successfully');

        // Thông tin mail
        const mailOptions = {
            from: 'tranduyduc9679@gmail.com',
            to: '2251012040duc@ou.edu.vn',
            subject: subject,
            text: message,
            html: `<pre>${message}</pre>` // Thêm HTML version
        };

        console.log('📤 Sending email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });

        // Gửi email với timeout
        const sendPromise = transporter.sendMail(mailOptions);
        const sendTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Email sending timeout')), 45000)
        );
        
        const info = await Promise.race([sendPromise, sendTimeoutPromise]);
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        
        // Cập nhật statistics
        try {
            let data = { jopi: 0, doki: 0 };
            
            if (fs.existsSync('data.json')) {
                const fileContent = fs.readFileSync('data.json', 'utf8');
                data = JSON.parse(fileContent);
            }
            
            const choice = message.toUpperCase().includes('JOPI') ? 'jopi' : 
                          message.toUpperCase().includes('DOKI') ? 'doki' : null;
            
            if (choice && data[choice] !== undefined) {
                data[choice]++;
                fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
                console.log('📊 Updated stats:', data);
            }
        } catch (fileError) {
            console.log('⚠️ Could not update data.json:', fileError.message);
        }

        console.log('📧 === EMAIL REQUEST SUCCESS ===');
        
        res.json({ 
            success: true, 
            message: 'Email đã được gửi thành công!',
            messageId: info.messageId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ === EMAIL REQUEST FAILED ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        let errorMessage = 'Lỗi không xác định';
        
        if (error.message.includes('timeout')) {
            errorMessage = 'Timeout - Mất quá nhiều thời gian để kết nối email server';
        } else if (error.message.includes('authentication')) {
            errorMessage = 'Lỗi xác thực Gmail - Kiểm tra username/password';
        } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
            errorMessage = 'Lỗi kết nối mạng - Kiểm tra internet';
        } else {
            errorMessage = error.message;
        }
        
        res.status(500).json({ 
            success: false, 
            message: errorMessage,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    try {
        if (fs.existsSync('data.json')) {
            const data = fs.readFileSync('data.json', 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({ jopi: 0, doki: 0 });
        }
    } catch (error) {
        console.error('Error reading stats:', error);
        res.json({ jopi: 0, doki: 0, error: error.message });
    }
});

// 404 handler
app.use('*', (req, res) => {
    console.log('🔍 Route not found:', req.originalUrl);
    res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy endpoint: ' + req.originalUrl 
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('💥 Global error handler:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Lỗi server: ' + error.message,
        timestamp: new Date().toISOString()
    });
});

// Start server
const server = app.listen(port, () => {
    console.log(`🎉 Birthday Book Server đang chạy!`);
    console.log(`📍 URL: http://localhost:${port}`);
    
});

// Increase server timeout
server.timeout = 120000; // 2 phút

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Đang tắt server...');
    server.close(() => {
        console.log('✅ Server đã tắt');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection tại:', promise, 'lý do:', reason);
});