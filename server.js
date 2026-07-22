const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// ============================================
// ✨ السماح لأي مصدر بالاتصال (حل CORS)
// ============================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// ============================================
// 🌐 رابط السيرفر العام (ثابت)
// ============================================
const BASE_URL = "https://cement-barn-statute-candles.trycloudflare.com";

// ============================================
// 📁 مجلدات الرفع
// ============================================
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');
const VIDEOS_DIR = path.join(UPLOADS_DIR, 'videos');

// إنشاء المجلدات إذا ما موجودة
[UPLOADS_DIR, IMAGES_DIR, VIDEOS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ✨ خدمة الملفات المرفوعة
app.use('/uploads', express.static(UPLOADS_DIR));

// ============================================
// 📁 ملف تخزين البيانات
// ============================================
const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({ posts: [], users: [] }, null, 2));
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('خطأ قراءة البيانات:', e);
        return { posts: [], users: [] };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error('خطأ حفظ البيانات:', e);
        return false;
    }
}

// ============================================
// 🖼️ دالة حفظ base64 كملف
// ============================================
function saveBase64File(base64String, folder) {
    try {
        const matches = base64String.match(/^data:(image|video)\/(\w+);base64,(.+)$/);
        if (!matches) return base64String;
        
        const type = matches[1];
        const ext = matches[2];
        const data = matches[3];
        
        const filename = `${uuidv4()}.${ext}`;
        const filepath = path.join(UPLOADS_DIR, folder, filename);
        
        fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
        
        return `${BASE_URL}/uploads/${folder}/${filename}`;
    } catch(e) {
        console.error('خطأ حفظ الملف:', e);
        return base64String;
    }
}

// ============================================
// 🗑️ دالة حذف الملفات
// ============================================
function deletePostFiles(post) {
    try {
        if (post.user_avatar && post.user_avatar.includes('/uploads/')) {
            const relativePath = post.user_avatar.replace(BASE_URL, '');
            const filepath = path.join(__dirname, relativePath);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        }
        
        if (post.images && Array.isArray(post.images)) {
            post.images.forEach(img => {
                if (img && img.includes('/uploads/')) {
                    const relativePath = img.replace(BASE_URL, '');
                    const filepath = path.join(__dirname, relativePath);
                    if (fs.existsSync(filepath)) {
                        fs.unlinkSync(filepath);
                    }
                }
            });
        }
        
        if (post.video_url && post.video_url.includes('/uploads/')) {
            const relativePath = post.video_url.replace(BASE_URL, '');
            const filepath = path.join(__dirname, relativePath);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        }
    } catch(e) {
        console.error('خطأ حذف الملفات:', e);
    }
}

// ============================================
// 📝 API المنشورات
// ============================================

// جلب كل المنشورات
app.get('/api/posts', (req, res) => {
    const data = readData();
    const posts = data.posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(posts);
});

// جلب منشور واحد
app.get('/api/posts/:id', (req, res) => {
    const data = readData();
    const post = data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });
    res.json(post);
});

// إنشاء منشور جديد ✨ (مع معالجة الأفاتار + الصور)
app.post('/api/posts', (req, res) => {
    const data = readData();
    
    // ✨ معالجة صورة الأفاتار إذا كانت base64
    let userAvatar = req.body.user_avatar || '';
    if (userAvatar && typeof userAvatar === 'string' && userAvatar.startsWith('data:')) {
        userAvatar = saveBase64File(userAvatar, 'images');
        console.log(`   👤 أفاتار: ${userAvatar.substring(0, 60)}...`);
    }
    
    // ✨ معالجة الصور
    let images = [];
    if (req.body.images && Array.isArray(req.body.images)) {
        images = req.body.images.map(img => {
            if (typeof img === 'string' && img.startsWith('data:')) {
                return saveBase64File(img, 'images');
            }
            return img;
        });
    }
    
    let videoUrl = req.body.video_url || null;
    
    const newPost = {
        id: uuidv4(),
        user_id: req.body.user_id || 'anon',
        username: req.body.username || 'مستخدم',
        user_avatar: userAvatar,
        content: req.body.content || '',
        images: images,
        video_url: videoUrl,
        youtube_url: req.body.youtube_url || null,
        poll: req.body.poll || null,
        is_spoiler: req.body.is_spoiler || false,
        comments_locked: req.body.comments_locked || false,
        comments: [],
        comments_count: 0,
        roses_count: 0,
        post_notifications: [],
        created_at: new Date().toISOString()
    };
    
    data.posts.push(newPost);
    saveData(data);
    res.status(201).json(newPost);
    
    console.log(`✅ منشور جديد: ${newPost.id}`);
    console.log(`   🖼️ ${images.length} صورة | 🎬 ${videoUrl ? 'فيديو' : 'لا يوجد'}`);
});

// تعديل منشور
app.patch('/api/posts/:id', (req, res) => {
    const data = readData();
    const index = data.posts.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المنشور غير موجود' });
    
    Object.keys(req.body).forEach(key => {
        if (key !== 'id' && key !== 'created_at') {
            data.posts[index][key] = req.body[key];
        }
    });
    
    saveData(data);
    res.json(data.posts[index]);
});

// حذف منشور
app.delete('/api/posts/:id', (req, res) => {
    const data = readData();
    const post = data.posts.find(p => p.id === req.params.id);
    
    if (!post) {
        return res.status(404).json({ error: 'المنشور غير موجود' });
    }
    
    deletePostFiles(post);
    
    data.posts = data.posts.filter(p => p.id !== req.params.id);
    saveData(data);
    
    console.log(`🗑️ تم حذف المنشور: ${req.params.id}`);
    res.json({ message: 'تم حذف المنشور' });
});

// ============================================
// 💬 API التعليقات ✨ (مع معالجة الأفاتار)
// ============================================

// إضافة تعليق
app.post('/api/posts/:id/comments', (req, res) => {
    const data = readData();
    const post = data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });
    
    // ✨ معالجة صورة الأفاتار إذا كانت base64
    let userAvatar = req.body.user_avatar || '';
    if (userAvatar && typeof userAvatar === 'string' && userAvatar.startsWith('data:')) {
        userAvatar = saveBase64File(userAvatar, 'images');
        console.log(`   💬 أفاتار تعليق: ${userAvatar.substring(0, 60)}...`);
    }
    
    const newComment = {
        id: 'c' + Date.now(),
        user_id: req.body.user_id || 'anon',
        username: req.body.username || 'مستخدم',
        user_avatar: userAvatar,
        content: req.body.content,
        created_at: new Date().toISOString()
    };
    
    if (!post.comments) post.comments = [];
    post.comments.push(newComment);
    post.comments_count = post.comments.length;
    
    saveData(data);
    res.status(201).json(newComment);
});

// حذف تعليق
app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
    const data = readData();
    const post = data.posts.find(p => p.id === req.params.postId);
    if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });
    
    post.comments = post.comments.filter(c => c.id !== req.params.commentId);
    post.comments_count = post.comments.length;
    
    saveData(data);
    res.json({ message: 'تم حذف التعليق' });
});

// ============================================
// 👤 API تحويل الأفاتار
// ============================================
app.post('/api/convert-avatar', (req, res) => {
    const avatar = req.body.avatar;
    const uid = req.body.uid;
    
    if (avatar && avatar.startsWith('data:')) {
        const url = saveBase64File(avatar, 'images');
        console.log(`   👤 أفاتار ${uid}: ${url.substring(0, 60)}...`);
        res.json({ url: url });
    } else {
        res.json({ url: avatar });
    }
});

// ============================================
// 🔔 API الإشعارات
// ============================================

app.get('/api/notifications/:username', (req, res) => {
    const data = readData();
    const allNotifs = [];
    
    data.posts.forEach(post => {
        if (post.username === req.params.username && post.post_notifications) {
            post.post_notifications.forEach(n => {
                allNotifs.push({ ...n, postId: post.id });
            });
        }
    });
    
    allNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(allNotifs);
});

// ============================================
// 🪙 API العملات
// ============================================

app.post('/api/posts/:id/roses', (req, res) => {
    const data = readData();
    const post = data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'المنشور غير موجود' });
    
    const count = parseInt(req.body.count) || 0;
    post.roses_count = (post.roses_count || 0) + count;
    
    saveData(data);
    res.json({ roses_count: post.roses_count });
});

// ============================================
// 📊 إحصائيات
// ============================================
app.get('/api/stats', (req, res) => {
    const data = readData();
    res.json({
        posts: data.posts.length,
        users: data.users.length,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// 🚀 تشغيل السيرفر
// ============================================
app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   🚀 سيرفر Anime Shadow              ║');
    console.log(`║   📡 محلي: http://localhost:${PORT}      ║`);
    console.log(`║   🌐 عام: ${BASE_URL}  ║`);
    console.log(`║   📁 البيانات: ${DATA_FILE}  ║`);
    console.log(`║   🖼️  الصور: ${IMAGES_DIR}  ║`);
    console.log(`║   🎬 الفيديو: ${VIDEOS_DIR}  ║`);
    console.log('╚══════════════════════════════════════╝');
});