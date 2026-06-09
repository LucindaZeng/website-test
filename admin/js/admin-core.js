/**
 * WFX Admin Core System
 * Handles authentication, user management, content management, and activity logging
 */

/**
 * Escape HTML special characters to prevent stored XSS when rendering
 * user-supplied content into innerHTML. Use sanitizeHtml() for content
 * that should retain basic markup (b, i, etc.).
 */
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Minimal HTML sanitizer for rich-text fields. Strips <script>, <iframe>,
 * <object>, <embed>, and any on* event handlers. Allows common formatting
 * tags. For production, consider DOMPurify (https://github.com/cure53/DOMPurify).
 */
function sanitizeHtml(html) {
    if (html == null) return '';
    let s = String(html);
    // Strip dangerous tags entirely
    s = s.replace(/<\s*(script|iframe|object|embed|link|meta|style|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    s = s.replace(/<\s*(script|iframe|object|embed|link|meta|style|form)\b[^>]*\/?>/gi, '');
    // Strip on*= handlers
    s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
    s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
    s = s.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');
    // Strip javascript: in href/src
    s = s.replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/gi, ' $1="#"');
    s = s.replace(/\s(href|src)\s*=\s*'javascript:[^']*'/gi, " $1='#'");
    return s;
}

// Expose globally
window.escapeHtml = escapeHtml;
window.sanitizeHtml = sanitizeHtml;

const AdminCore = {
    // ─────────────────────────────────────────────────────────────────────
    // SECURITY NOTE
    // ─────────────────────────────────────────────────────────────────────
    // Authentication is server-side ONLY. The frontend NEVER stores or
    // verifies passwords. Login flow:
    //
    //   1. User submits credentials → POST /api/auth/login
    //   2. Server verifies via PBKDF2-HMAC-SHA256 (200k iterations) against
    //      the hash stored in uploads/.auth/admin_users.json (mode 0600)
    //   3. Server issues HMAC-signed session token in HttpOnly+SameSite=Strict
    //      cookie + returns CSRF token in response body
    //   4. Frontend caches CSRF in memory + localStorage for subsequent
    //      state-changing requests; it has NO access to the session cookie
    //
    // The bootstrap admin password (`wfx6688`) lives ONLY in server.py's
    // ensure_default_admin() and is hashed before storage. On first login,
    // `must_change_password: true` forces the user to change it via
    // /admin/change-password.html before any other action is allowed.
    //
    // Default admin profile metadata (no credentials):
    DEFAULT_ADMIN: {
        id: 1,
        username: 'admin',
        role: 'super_admin',
        name: 'Administrator',
        email: 'lucindaz@wanfuxin.com',
        createdAt: '2024-01-01T00:00:00Z',
        lastLogin: null
    },

    // Default homepage media configuration
    DEFAULT_HOMEPAGE_MEDIA: {
        heroVideo: 'hero-video.mp4',
        companyVideo: 'company-video.mp4',
        companyVideoPoster: '../images/company-video-poster.jpg',
        services: {
            cncMilling: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=300&fit=crop',
            cncTurning: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&h=300&fit=crop',
            fiveAxis: 'https://images.unsplash.com/photo-1581091226817-a6a2a5aee158?w=400&h=300&fit=crop',
            precisionInspection: 'https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=400&h=300&fit=crop'
        },
        industries: {
            aerospace: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
            automotive: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400&h=300&fit=crop',
            medical: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop',
            electronics: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop',
            robotics: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&h=300&fit=crop',
            industrial: 'https://images.unsplash.com/photo-1581091226817-a6a2a5aee158?w=400&h=300&fit=crop'
        }
    },

    // Initialize the system
    init: function() {
        const cacheDefault = (key, value) => {
            if (window.WFX_CMS_SYNC && typeof window.WFX_CMS_SYNC.cacheRaw === 'function') {
                window.WFX_CMS_SYNC.cacheRaw(key, value);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
        };

        // Restore admin token for CMS sync (if previously logged in)
        const savedToken = localStorage.getItem('wfx_api_token');
        if (savedToken) {
            window.WFX_ADMIN_TOKEN = savedToken;
        }
        // Restore CSRF token from previous login (so cms-sync can authenticate)
        const savedCsrf = localStorage.getItem('wfx_csrf_token');
        if (savedCsrf) {
            window.WFX_CSRF_TOKEN = savedCsrf;
        }
        // Verify session with server in the background; if expired, fetch a new CSRF token
        // (the server's /api/auth/me endpoint validates the cookie, so this confirms login)
        if (typeof fetch === 'function') {
            fetch('/api/auth/me', { credentials: 'same-origin' })
                .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
                .then(result => {
                    const j = result.body;
                    if (j && j.ok) {
                        if (j.user) {
                            const serverUser = {
                                id: j.user.id || j.user.uid,
                                username: j.user.username || j.user.name,
                                name: j.user.full_name || j.user.username || j.user.name,
                                full_name: j.user.full_name || '',
                                email: j.user.email || '',
                                role: j.user.role || 'viewer',
                                must_change_password: !!j.user.must_change_password,
                                lastLogin: j.user.last_login_at || null
                            };
                            localStorage.setItem('wfx_admin_user', JSON.stringify(serverUser));
                        }
                        // Session still valid — refresh CSRF token if missing
                        if (!savedCsrf) {
                            return fetch('/api/auth/csrf', { credentials: 'same-origin' })
                                .then(r => r.json())
                                .then(c => {
                                    if (c.ok && c.csrf_token) {
                                        localStorage.setItem('wfx_csrf_token', c.csrf_token);
                                        window.WFX_CSRF_TOKEN = c.csrf_token;
                                    }
                                });
                        }
                    } else if (result.status === 401 || result.status === 403) {
                        localStorage.removeItem('wfx_admin_logged_in');
                        localStorage.removeItem('wfx_admin_user');
                        localStorage.removeItem('wfx_csrf_token');
                        delete window.WFX_CSRF_TOKEN;
                        if (!/\/admin\/(?:index\.html)?$/.test(window.location.pathname)) {
                            window.location.href = 'index.html?session=expired';
                        }
                    }
                })
                .catch(() => { /* keep the current screen, but CMS writes will report failure */ });
        }

        // Initialize users if not exists
        if (!localStorage.getItem('wfx_users')) {
            localStorage.setItem('wfx_users', JSON.stringify([this.DEFAULT_ADMIN]));
        }
        
        // Initialize content storage
        if (!localStorage.getItem('wfx_content')) {
            localStorage.setItem('wfx_content', JSON.stringify({
                images: [],
                videos: [],
                texts: {}
            }));
        }
        
        // Initialize homepage media configuration
        if (!localStorage.getItem('wfx_homepage_media')) {
            cacheDefault('wfx_homepage_media', this.DEFAULT_HOMEPAGE_MEDIA);
        }
        
        // Initialize blog posts
        if (!localStorage.getItem('wfx_blog_posts')) {
            cacheDefault('wfx_blog_posts', []);
        }
        
        // Initialize news
        if (!localStorage.getItem('wfx_news')) {
            cacheDefault('wfx_news', []);
        }
        
        // Initialize activity log
        if (!localStorage.getItem('wfx_activity_log')) {
            localStorage.setItem('wfx_activity_log', JSON.stringify([]));
        }
    },

    // ==================== Authentication ====================

    /**
     * DEPRECATED — kept only for emergency offline access from older code.
     * Real authentication happens server-side via POST /api/auth/login (see
     * admin/index.html). Without the server, no login should be possible.
     *
     * This function previously checked passwords stored in localStorage,
     * which is unsafe — XSS attacks can read localStorage. It now always
     * returns false, forcing all auth through the server.
     */
    login: function(username, password) {
        console.warn('AdminCore.login() is deprecated; use POST /api/auth/login');
        return false;
    },

    logout: function() {
        const user = this.getCurrentUser();
        if (user) {
            this.logAction('logout', 'User logged out', { username: user.username });
        }
        // Clear server session (best-effort — don't block UI on network)
        if (typeof fetch === 'function') {
            fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            }).catch(() => { /* ignore */ });
        }
        // Clear all local state
        localStorage.removeItem('wfx_admin_logged_in');
        localStorage.removeItem('wfx_admin_user');
        localStorage.removeItem('wfx_csrf_token');
        delete window.WFX_CSRF_TOKEN;
        window.location.href = 'index.html';
    },

    isLoggedIn: function() {
        return localStorage.getItem('wfx_admin_logged_in') === 'true';
    },

    getCurrentUser: function() {
        const userStr = localStorage.getItem('wfx_admin_user');
        return userStr ? JSON.parse(userStr) : null;
    },

    checkAuth: function() {
        if (!this.isLoggedIn()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    },

    // Compatibility helper used by restored admin pages.
    requireAuth: function() {
        return this.checkAuth();
    },

    // ==================== User Management ====================
    
    getUsers: function() {
        this.init();
        return JSON.parse(localStorage.getItem('wfx_users'));
    },

    addUser: function(userData) {
        const users = this.getUsers();
        const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        
        const newUser = {
            id: newId,
            username: userData.username,
            password: userData.password,
            role: userData.role || 'editor',
            name: userData.name,
            email: userData.email,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        // Check if username already exists
        if (users.find(u => u.username === userData.username)) {
            return { success: false, message: 'Username already exists' };
        }
        
        users.push(newUser);
        localStorage.setItem('wfx_users', JSON.stringify(users));
        
        this.logAction('user_created', `Created new user: ${userData.username}`, { userId: newId });
        
        return { success: true, user: newUser };
    },

    updateUser: function(userId, userData) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === userId);
        
        if (index === -1) {
            return { success: false, message: 'User not found' };
        }
        
        // Check if username is being changed and if it already exists
        if (userData.username && userData.username !== users[index].username) {
            if (users.find(u => u.username === userData.username)) {
                return { success: false, message: 'Username already exists' };
            }
        }
        
        users[index] = { ...users[index], ...userData };
        localStorage.setItem('wfx_users', JSON.stringify(users));
        
        this.logAction('user_updated', `Updated user: ${users[index].username}`, { userId });
        
        return { success: true, user: users[index] };
    },

    deleteUser: function(userId) {
        const users = this.getUsers();
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return { success: false, message: 'User not found' };
        }
        
        // Prevent deleting the default admin
        if (user.username === 'admin') {
            return { success: false, message: 'Cannot delete the default admin account' };
        }
        
        const filteredUsers = users.filter(u => u.id !== userId);
        localStorage.setItem('wfx_users', JSON.stringify(filteredUsers));
        
        this.logAction('user_deleted', `Deleted user: ${user.username}`, { userId });
        
        return { success: true };
    },

    changePassword: function(userId, newPassword) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === userId);
        
        if (index === -1) {
            return { success: false, message: 'User not found' };
        }
        
        users[index].password = newPassword;
        localStorage.setItem('wfx_users', JSON.stringify(users));
        
        this.logAction('password_changed', `Password changed for user: ${users[index].username}`, { userId });
        
        return { success: true };
    },

    // ==================== Content Management ====================
    
    getContent: function() {
        this.init();
        return JSON.parse(localStorage.getItem('wfx_content'));
    },

    updateImage: function(imageId, imageData) {
        const content = this.getContent();
        const index = content.images.findIndex(i => i.id === imageId);
        
        if (index === -1) {
            // Add new image
            const newId = content.images.length > 0 ? Math.max(...content.images.map(i => i.id)) + 1 : 1;
            content.images.push({
                id: newId,
                ...imageData,
                updatedAt: new Date().toISOString()
            });
            this.logAction('image_added', `Added new image: ${imageData.name}`, { imageId: newId });
        } else {
            // Update existing image
            content.images[index] = {
                ...content.images[index],
                ...imageData,
                updatedAt: new Date().toISOString()
            };
            this.logAction('image_updated', `Updated image: ${imageData.name}`, { imageId });
        }
        
        localStorage.setItem('wfx_content', JSON.stringify(content));
        return { success: true };
    },

    // ==================== Homepage Media Management ====================
    
    getHomepageMedia: function() {
        this.init();
        return JSON.parse(localStorage.getItem('wfx_homepage_media'));
    },

    updateHomepageMedia: function(key, value, category = null) {
        const media = this.getHomepageMedia();
        
        if (category) {
            if (!media[category]) {
                media[category] = {};
            }
            media[category][key] = value;
            this.logAction('homepage_media_updated', `Updated ${category}.${key}`, { category, key, value });
        } else {
            media[key] = value;
            this.logAction('homepage_media_updated', `Updated ${key}`, { key, value });
        }
        
        localStorage.setItem('wfx_homepage_media', JSON.stringify(media));
        return { success: true, media };
    },

    resetHomepageMedia: function() {
        localStorage.setItem('wfx_homepage_media', JSON.stringify(this.DEFAULT_HOMEPAGE_MEDIA));
        this.logAction('homepage_media_reset', 'Reset all homepage media to defaults');
        return { success: true };
    },

    deleteImage: function(imageId) {
        const content = this.getContent();
        const image = content.images.find(i => i.id === imageId);
        
        if (image) {
            content.images = content.images.filter(i => i.id !== imageId);
            localStorage.setItem('wfx_content', JSON.stringify(content));
            this.logAction('image_deleted', `Deleted image: ${image.name}`, { imageId });
        }
        
        return { success: true };
    },

    updateVideo: function(videoId, videoData) {
        const content = this.getContent();
        const index = content.videos.findIndex(v => v.id === videoId);
        
        if (index === -1) {
            // Add new video
            const newId = content.videos.length > 0 ? Math.max(...content.videos.map(v => v.id)) + 1 : 1;
            content.videos.push({
                id: newId,
                ...videoData,
                updatedAt: new Date().toISOString()
            });
            this.logAction('video_added', `Added new video: ${videoData.name}`, { videoId: newId });
        } else {
            // Update existing video
            content.videos[index] = {
                ...content.videos[index],
                ...videoData,
                updatedAt: new Date().toISOString()
            };
            this.logAction('video_updated', `Updated video: ${videoData.name}`, { videoId });
        }
        
        localStorage.setItem('wfx_content', JSON.stringify(content));
        return { success: true };
    },

    updateText: function(textKey, textValue, pageName) {
        const content = this.getContent();
        const previousValue = content.texts[textKey];
        
        content.texts[textKey] = {
            value: textValue,
            page: pageName,
            updatedAt: new Date().toISOString()
        };
        
        localStorage.setItem('wfx_content', JSON.stringify(content));
        this.logAction('text_updated', `Updated text on ${pageName}: ${textKey}`, { 
            textKey, 
            previousValue: previousValue?.value,
            newValue: textValue
        });
        
        return { success: true };
    },

    // ==================== Blog Management ====================
    
    getBlogPosts: function() {
        this.init();
        return JSON.parse(localStorage.getItem('wfx_blog_posts'));
    },

    addBlogPost: function(postData) {
        const posts = this.getBlogPosts();
        const newId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;
        const user = this.getCurrentUser();
        
        const newPost = {
            id: newId,
            title: postData.title,
            slug: this.generateSlug(postData.title),
            content: postData.content,
            excerpt: postData.excerpt,
            category: postData.category,
            tags: postData.tags || [],
            featuredImage: postData.featuredImage,
            status: postData.status || 'draft',
            is_pinned: !!postData.is_pinned,
            author: user ? user.name : 'Admin',
            authorId: user ? user.id : 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            publishedAt: postData.status === 'published' ? new Date().toISOString() : null
        };
        
        posts.push(newPost);
        localStorage.setItem('wfx_blog_posts', JSON.stringify(posts));
        
        this.logAction('blog_created', `Created article: ${postData.title}`, { postId: newId });
        
        return { success: true, post: newPost };
    },

    updateBlogPost: function(postId, postData) {
        const posts = this.getBlogPosts();
        const index = posts.findIndex(p => p.id === postId);
        
        if (index === -1) {
            return { success: false, message: 'Post not found' };
        }
        
        posts[index] = {
            ...posts[index],
            ...postData,
            updatedAt: new Date().toISOString(),
            publishedAt: postData.status === 'published' && !posts[index].publishedAt 
                ? new Date().toISOString() 
                : posts[index].publishedAt
        };
        
        localStorage.setItem('wfx_blog_posts', JSON.stringify(posts));
        
        this.logAction('blog_updated', `Updated article: ${posts[index].title}`, { postId });
        
        return { success: true, post: posts[index] };
    },

    deleteBlogPost: function(postId) {
        const posts = this.getBlogPosts();
        const post = posts.find(p => p.id === postId);
        
        if (post) {
            const filteredPosts = posts.filter(p => p.id !== postId);
            localStorage.setItem('wfx_blog_posts', JSON.stringify(filteredPosts));
            this.logAction('blog_deleted', `Deleted article: ${post.title}`, { postId });
        }
        
        return { success: true };
    },

    // ==================== News Management ====================
    
    getNews: function() {
        this.init();
        return JSON.parse(localStorage.getItem('wfx_news'));
    },

    addNews: function(newsData) {
        const news = this.getNews();
        const newId = news.length > 0 ? Math.max(...news.map(n => n.id)) + 1 : 1;
        const user = this.getCurrentUser();
        
        const newNews = {
            id: newId,
            title: newsData.title,
            slug: this.generateSlug(newsData.title),
            content: newsData.content,
            excerpt: newsData.excerpt,
            category: newsData.category,
            featuredImage: newsData.featuredImage,
            status: newsData.status || 'draft',
            is_pinned: !!newsData.is_pinned,
            author: user ? user.name : 'Admin',
            authorId: user ? user.id : 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            publishedAt: newsData.status === 'published' ? new Date().toISOString() : null
        };
        
        news.push(newNews);
        localStorage.setItem('wfx_news', JSON.stringify(news));
        
        this.logAction('news_created', `Created news: ${newsData.title}`, { newsId: newId });
        
        return { success: true, news: newNews };
    },

    updateNews: function(newsId, newsData) {
        const news = this.getNews();
        const index = news.findIndex(n => n.id === newsId);
        
        if (index === -1) {
            return { success: false, message: 'News not found' };
        }
        
        news[index] = {
            ...news[index],
            ...newsData,
            updatedAt: new Date().toISOString(),
            publishedAt: newsData.status === 'published' && !news[index].publishedAt 
                ? new Date().toISOString() 
                : news[index].publishedAt
        };
        
        localStorage.setItem('wfx_news', JSON.stringify(news));
        
        this.logAction('news_updated', `Updated news: ${news[index].title}`, { newsId });
        
        return { success: true, news: news[index] };
    },

    deleteNews: function(newsId) {
        const news = this.getNews();
        const newsItem = news.find(n => n.id === newsId);
        
        if (newsItem) {
            const filteredNews = news.filter(n => n.id !== newsId);
            localStorage.setItem('wfx_news', JSON.stringify(filteredNews));
            this.logAction('news_deleted', `Deleted news: ${newsItem.title}`, { newsId });
        }
        
        return { success: true };
    },

    // ==================== Activity Log ====================
    
    logAction: function(action, description, details = {}) {
        const logs = JSON.parse(localStorage.getItem('wfx_activity_log') || '[]');
        const user = this.getCurrentUser();
        
        const logEntry = {
            id: logs.length > 0 ? Math.max(...logs.map(l => l.id)) + 1 : 1,
            action: action,
            description: description,
            details: details,
            user: user ? user.username : 'system',
            userId: user ? user.id : null,
            timestamp: new Date().toISOString(),
            ip: 'N/A' // Would need server-side implementation for actual IP
        };
        
        logs.unshift(logEntry); // Add to beginning
        
        // Keep only last 1000 entries
        if (logs.length > 1000) {
            logs.splice(1000);
        }
        
        localStorage.setItem('wfx_activity_log', JSON.stringify(logs));
    },

    logActivity: function(action, description, details = {}) {
        const normalized = String(action || 'activity')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        this.logAction(normalized || 'activity', description || action, details);
    },

    getActivityLog: function(filters = {}) {
        const logs = JSON.parse(localStorage.getItem('wfx_activity_log') || '[]');
        
        let filteredLogs = logs;
        
        if (filters.action) {
            filteredLogs = filteredLogs.filter(l => l.action === filters.action);
        }
        
        if (filters.user) {
            filteredLogs = filteredLogs.filter(l => l.user === filters.user);
        }
        
        if (filters.startDate) {
            filteredLogs = filteredLogs.filter(l => new Date(l.timestamp) >= new Date(filters.startDate));
        }
        
        if (filters.endDate) {
            filteredLogs = filteredLogs.filter(l => new Date(l.timestamp) <= new Date(filters.endDate));
        }
        
        if (filters.limit) {
            filteredLogs = filteredLogs.slice(0, filters.limit);
        }
        
        return filteredLogs;
    },

    fetchActivityLog: async function(filters = {}) {
        let serverLogs = [];
        try {
            const response = await fetch('/api/audit', { credentials: 'same-origin' });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.ok && Array.isArray(result.rows)) {
                serverLogs = result.rows.map(row => {
                    let details = {};
                    if (row.detail) {
                        try { details = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail; }
                        catch (e) { details = { detail: row.detail }; }
                    }
                    if (row.resource_type) details.resource = row.resource_type;
                    if (row.resource_id) details.resourceId = row.resource_id;
                    if (row.ip_address) details.ip = row.ip_address;
                    const resource = [row.resource_type, row.resource_id].filter(Boolean).join(' / ');
                    return {
                        id: row.id,
                        action: row.action,
                        description: resource ? `${row.action.replace(/_/g, ' ')}: ${resource}` : row.action.replace(/_/g, ' '),
                        details,
                        user: row.username || 'system',
                        userId: row.user_id,
                        timestamp: row.created_at,
                        ip: row.ip_address || 'N/A'
                    };
                });
            }
        } catch (e) {
            serverLogs = [];
        }

        // Server audit entries cover persisted API operations; local entries
        // cover UI actions such as category edits and export/import. They are
        // complementary, so always merge them instead of hiding one source.
        let logs = serverLogs.concat(this.getActivityLog());
        logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        logs = logs.map((log, index) => ({ ...log, id: index + 1 }));

        if (filters.action) logs = logs.filter(l => l.action === filters.action);
        if (filters.user) logs = logs.filter(l => l.user === filters.user);
        if (filters.startDate) logs = logs.filter(l => new Date(l.timestamp) >= new Date(filters.startDate));
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            logs = logs.filter(l => new Date(l.timestamp) <= end);
        }
        if (filters.limit) logs = logs.slice(0, filters.limit);
        return logs;
    },

    // ==================== Utility Functions ====================
    
    generateSlug: function(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/--+/g, '-')
            .trim();
    },

    formatDate: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatRelativeTime: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        
        return this.formatDate(dateString);
    },

    // Get dashboard statistics
    getStats: function() {
        return {
            totalUsers: this.getUsers().length,
            totalBlogPosts: this.getBlogPosts().length,
            totalNews: this.getNews().length,
            publishedPosts: this.getBlogPosts().filter(p => p.status === 'published').length,
            publishedNews: this.getNews().filter(n => n.status === 'published').length,
            recentActivity: this.getActivityLog({ limit: 10 })
        };
    },

    // Load custom logos from localStorage
    loadCustomLogos: function() {
        // Load custom main logo for sidebar
        const customLogo = localStorage.getItem('wfx_custom_logo');
        if (customLogo) {
            const sidebarLogo = document.querySelector('.sidebar-header img');
            if (sidebarLogo) {
                sidebarLogo.src = customLogo;
            }
        }
        
        // Load custom favicon
        const customFavicon = localStorage.getItem('wfx_custom_favicon');
        if (customFavicon) {
            const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
            faviconLinks.forEach(link => {
                link.href = customFavicon;
            });
        }
    }
};

// ==================== Page Content Management ====================

const PageContentManager = {
    // Storage key for page content
    PAGE_CONTENT_KEY: 'wfx_page_content',

    // Get all page content
    getAllPageContent: function() {
        const content = localStorage.getItem(this.PAGE_CONTENT_KEY);
        return content ? JSON.parse(content) : {};
    },

    // Get content for specific page
    getPageContent: function(pageName) {
        const all = this.getAllPageContent();
        return all[pageName] || null;
    },

    // Save page content
    savePageContent: function(pageName, content) {
        const all = this.getAllPageContent();
        all[pageName] = content;
        localStorage.setItem(this.PAGE_CONTENT_KEY, JSON.stringify(all));
        this.logAction('content_updated', `Updated content for ${pageName}`, { pageName });
        return { success: true };
    },

    // Export all content
    exportAllContent: function() {
        return JSON.stringify(this.getAllPageContent(), null, 2);
    },

    // Import content
    importAllContent: function(jsonString) {
        try {
            const content = JSON.parse(jsonString);
            localStorage.setItem(this.PAGE_CONTENT_KEY, JSON.stringify(content));
            this.logAction('content_imported', 'Imported content from file', {});
            return { success: true };
        } catch (e) {
            return { success: false, message: 'Invalid JSON' };
        }
    }
};

// Initialize on load
AdminCore.init();

// Load custom logos when DOM is ready + apply role-based nav filtering
document.addEventListener('DOMContentLoaded', function() {
    AdminCore.loadCustomLogos();
    AdminCore.enhanceAdminNavigation();
    AdminCore.applyRoleBasedNav();
});

AdminCore.enhanceAdminNavigation = function() {
    document.querySelectorAll('.sidebar-nav').forEach(nav => {
        const contentAnchor = nav.querySelector('a[href="pages.html"], a[href="page-images.html"], a[href="products.html"]');
        const section = contentAnchor && contentAnchor.closest('.nav-section');
        if (!section) return;

        function createLink(item) {
            const link = document.createElement('a');
            link.href = item.href;
            link.className = 'nav-item';
            link.dataset.adminLink = item.key;
            link.dataset.i18n = item.i18n;
            link.innerHTML = `<i class="fas ${item.icon}" aria-hidden="true"></i> ${item.label}`;
            return link;
        }

        let pages = section.querySelector('a[href="pages.html"]') || section.firstElementChild;
        let videos = section.querySelector('a[href="videos.html"]');
        if (!videos) {
            videos = createLink({
                key: 'videos', href: 'videos.html', icon: 'fa-video',
                i18n: 'nav.video_manager', label: 'Video Manager'
            });
            pages.insertAdjacentElement('beforebegin', videos);
        }

        let pageImages = section.querySelector('a[href="page-images.html"]') || pages;
        let collections = section.querySelector('a[href="collections.html"]');
        if (!collections) {
            collections = createLink({
                key: 'collections', href: 'collections.html', icon: 'fa-layer-group',
                i18n: 'nav.collections', label: 'Page Collections'
            });
            pageImages.insertAdjacentElement('afterend', collections);
        }

        let anchor = collections;
        [
            {
                key: 'faq', href: 'collections.html?page=faq', icon: 'fa-question-circle',
                i18n: 'nav.faq_manager', label: 'FAQ Manager'
            },
            {
                key: 'case-studies', href: 'collections.html?page=case-studies', icon: 'fa-briefcase',
                i18n: 'nav.case_studies', label: 'Case Studies'
            }
        ].forEach(item => {
            let link = section.querySelector(`a[href="${item.href}"]`);
            if (!link) {
                link = createLink(item);
                anchor.insertAdjacentElement('afterend', link);
            }
            anchor = link;
        });

        if (!section.querySelector('a[href="testimonials.html"]')) {
            const testimonials = createLink({
                key: 'testimonials', href: 'testimonials.html', icon: 'fa-quote-right',
                i18n: 'nav.testimonials', label: 'Testimonials'
            });
            const products = section.querySelector('a[href="products.html"]') || anchor;
            products.insertAdjacentElement('afterend', testimonials);
        }
    });
    if (window.AdminI18n) window.AdminI18n.applyAll();
};

// ─── Role-Based Navigation ────────────────────────────────────────────────
// Mirror of server's ROLE_PERMISSIONS — used to hide nav items the user can't use.
// If kept in sync with server, the UI gracefully degrades; if not, the server
// still enforces permissions, so this is just UX, not security.
AdminCore.ROLE_PERMISSIONS = {
    super_admin: ['*'],  // sees everything
    chief_editor: [
        'dashboard.html', 'videos.html', 'pages.html',
        'page-images.html', 'collections.html', 'products.html', 'testimonials.html',
        'categories.html', 'media.html',
        'blog.html', 'news.html', 'change-password.html'
    ],
    seo_specialist: [
        'dashboard.html', 'pages.html', 'page-images.html', 'collections.html',
        'media.html', 'blog.html', 'news.html', 'change-password.html'
    ],
    sales: [
        'dashboard.html', 'change-password.html'
        // (Quotes/contacts management pages would be added here when built)
    ],
    viewer: [
        'dashboard.html', 'change-password.html'
    ],
};

AdminCore.applyRoleBasedNav = function() {
    const user = this.getCurrentUser();
    if (!user || !user.role) return;

    // Super admin sees all — nothing to hide
    if (user.role === 'super_admin') return;

    const allowed = this.ROLE_PERMISSIONS[user.role] || [];
    if (allowed.includes('*')) return;

    // Always allow logout, view website
    const alwaysAllow = new Set(['../index.html', '#']);

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (alwaysAllow.has(href)) return;
        // Get just the filename (strip query/hash)
        const filename = href.split('/').pop().split('?')[0].split('#')[0];
        if (!allowed.includes(filename)) {
            link.style.display = 'none';
        }
    });

    // Hide section headers if all items in them are hidden
    document.querySelectorAll('.nav-section').forEach(section => {
        const visibleItems = Array.from(section.querySelectorAll('.nav-item'))
            .filter(el => el.style.display !== 'none');
        if (visibleItems.length === 0) {
            section.style.display = 'none';
        }
    });

    // Show role badge in header
    const userNameEl = document.getElementById('user-name');
    if (userNameEl && !userNameEl.dataset.roleApplied) {
        const roleLabels = {
            chief_editor: 'Chief Editor',
            seo_specialist: 'SEO Specialist',
            sales: 'Sales',
            viewer: 'Viewer (read-only)',
        };
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-block; margin-left:8px; padding:2px 8px; border-radius:10px; background:#dbeafe; color:#1e40af; font-size:0.75rem; font-weight:500;';
        badge.textContent = roleLabels[user.role] || user.role;
        badge.dataset.roleApplied = '1';
        userNameEl.appendChild(badge);
    }
};


/* ============================================================================
   i18n — bilingual UI for admin panel
   ============================================================================
   Public API:
     AdminI18n.t('key')         — translate a key in the active language
     AdminI18n.setLang('en'|'zh') — switch language and persist
     AdminI18n.getLang()         — current language
     AdminI18n.applyAll(root?)   — translate all data-i18n elements in DOM
     AdminI18n.attachToggle(el)  — wire up a language toggle button

   To make text translatable:
     <span data-i18n="nav.dashboard">Dashboard</span>
     <button data-i18n="action.save">Save</button>
     <input placeholder="..." data-i18n-attr="placeholder" data-i18n="form.search_placeholder">

   Scope: navigation + page titles + common action verbs only. Page-specific
   detail content (form labels in deep editors, error toasts) stays English.
   ============================================================================ */
const AdminI18n = {
    // Languages: 'en' (English) and 'zh' (中文)
    DICTIONARY: {
        // ── Sidebar nav sections ─────────────────────────────────────
        'nav.section.main':       { en: 'Main',                   zh: '主要' },
        'nav.section.content':    { en: 'Content Management',     zh: '内容管理' },
        'nav.section.system':     { en: 'System',                 zh: '系统' },
        // ── Sidebar nav items ────────────────────────────────────────
        'nav.dashboard':          { en: 'Dashboard',              zh: '控制台' },
        'nav.quotes':             { en: 'Quotes',                 zh: '询价单' },
        'nav.requests':           { en: 'Requests',               zh: '资料申请' },
        'nav.content_editor':     { en: 'Content Editor',         zh: '内容编辑器' },
        'nav.video_manager':      { en: 'Video Manager',          zh: '视频管理' },
        'nav.pages':              { en: 'Pages & Text',           zh: '页面与文字' },
        'nav.page_images':        { en: 'Page Images',            zh: '页面图片' },
        'nav.collections':        { en: 'Page Collections',       zh: '页面集合' },
        'nav.faq_manager':        { en: 'FAQ Manager',            zh: 'FAQ 管理' },
        'nav.case_studies':       { en: 'Case Studies',           zh: '案例研究' },
        'nav.products':           { en: 'Industry Products',      zh: '行业产品' },
        'nav.testimonials':       { en: 'Testimonials',           zh: '客户评价' },
        'nav.categories':         { en: 'Categories',             zh: '分类' },
        'nav.media':              { en: 'Media Library',          zh: '媒体库' },
        'nav.blog':               { en: 'Articles',               zh: '文章' },
        'nav.news':               { en: 'News',                   zh: '新闻' },
        'nav.users':              { en: 'User Management',        zh: '用户管理' },
        'nav.blocklist':          { en: 'IP Blocklist',           zh: 'IP 黑名单' },
        'nav.activity_log':       { en: 'Activity Log',           zh: '操作日志' },
        'nav.settings':           { en: 'Settings',               zh: '设置' },
        'nav.change_password':    { en: 'Change Password',        zh: '修改密码' },
        'nav.view_website':       { en: 'View Website',           zh: '查看网站' },
        'nav.logout':             { en: 'Logout',                 zh: '退出登录' },
        'nav.panel_title':        { en: 'Admin Panel',            zh: '管理后台' },

        // ── Page titles (header h1) ──────────────────────────────────
        'page.dashboard':         { en: 'Dashboard',                  zh: '控制台' },
        'page.quotes':            { en: 'Quote Requests',             zh: '询价单管理' },
        'page.requests':          { en: 'Resource Requests',          zh: '资料申请管理' },
        'page.content_editor':    { en: 'Content Editor',             zh: '内容编辑器' },
        'page.video_manager':     { en: 'Video Manager',              zh: '视频管理' },
        'page.pages':             { en: 'Bilingual Content Editor',   zh: '双语内容编辑器' },
        'page.page_images':       { en: 'Page Images',                zh: '页面图片' },
        'page.products':          { en: 'Industry Products',          zh: '行业产品' },
        'page.categories':        { en: 'Categories',                 zh: '分类管理' },
        'page.media':             { en: 'Media Library',              zh: '媒体库' },
        'page.blog':              { en: 'Articles',                   zh: '文章' },
        'page.news':              { en: 'News Management',            zh: '新闻管理' },
        'page.users':             { en: 'User Management',            zh: '用户管理' },
        'page.blocklist':         { en: 'IP Blocklist',               zh: 'IP 黑名单' },
        'page.activity_log':      { en: 'Activity Log',               zh: '操作日志' },
        'page.settings':          { en: 'Settings',                   zh: '系统设置' },
        'page.change_password':   { en: 'Change Password',            zh: '修改密码' },

        // ── Common action buttons ────────────────────────────────────
        'action.save':            { en: 'Save',          zh: '保存' },
        'action.cancel':          { en: 'Cancel',        zh: '取消' },
        'action.delete':          { en: 'Delete',        zh: '删除' },
        'action.edit':            { en: 'Edit',          zh: '编辑' },
        'action.add':             { en: 'Add',           zh: '添加' },
        'action.search':          { en: 'Search',        zh: '搜索' },
        'action.upload':          { en: 'Upload',        zh: '上传' },
        'action.download':        { en: 'Download',      zh: '下载' },
        'action.export':          { en: 'Export',        zh: '导出' },
        'action.import':          { en: 'Import',        zh: '导入' },
        'action.refresh':         { en: 'Refresh',       zh: '刷新' },
        'action.back':            { en: 'Back',          zh: '返回' },
        'action.confirm':         { en: 'Confirm',       zh: '确认' },
        'action.close':           { en: 'Close',         zh: '关闭' },

        // ── Role labels ──────────────────────────────────────────────
        'role.super_admin':       { en: 'Super Admin',           zh: '超级管理员' },
        'role.chief_editor':      { en: 'Chief Editor',          zh: '主编' },
        'role.editor':            { en: 'Editor',                zh: '编辑' },
        'role.seo_specialist':    { en: 'SEO Specialist',        zh: 'SEO 专员' },
        'role.sales':             { en: 'Sales',                 zh: '销售' },
        'role.viewer':            { en: 'Viewer (read-only)',    zh: '只读用户' },

        // ── Language switcher ────────────────────────────────────────
        'lang.toggle_label':      { en: 'Language',     zh: '语言' },
    },

    getLang() {
        try {
            return localStorage.getItem('wfx_admin_lang') || 'en';
        } catch (e) { return 'en'; }
    },

    setLang(lang) {
        if (lang !== 'en' && lang !== 'zh') return;
        try { localStorage.setItem('wfx_admin_lang', lang); } catch (e) {}
        document.documentElement.setAttribute('data-admin-lang', lang);
        this.applyAll();
        // Notify any listeners (pages with their own translations)
        try {
            document.dispatchEvent(new CustomEvent('admin-lang-changed', { detail: { lang } }));
        } catch (e) {}
    },

    t(key) {
        const entry = this.DICTIONARY[key];
        if (!entry) return key;  // missing key — show the key itself so it's visible
        return entry[this.getLang()] || entry.en || key;
    },

    /**
     * Apply translations to all elements in `root` (or whole document) that
     * carry data-i18n attributes.
     *   <span data-i18n="nav.dashboard">…</span>          → sets textContent
     *   <input data-i18n="form.x" data-i18n-attr="placeholder"> → sets placeholder
     */
    applyAll(root) {
        root = root || document;
        const els = root.querySelectorAll('[data-i18n]');
        els.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const attr = el.getAttribute('data-i18n-attr');
            const translated = this.t(key);
            if (attr) {
                el.setAttribute(attr, translated);
            } else {
                // Find or create a dedicated text node so we don't blow away
                // any child elements (e.g. an icon inside the link)
                const textNode = Array.from(el.childNodes)
                    .find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
                if (textNode) {
                    // Preserve any leading whitespace (e.g. " Dashboard")
                    const leading = textNode.textContent.match(/^\s*/)[0];
                    textNode.textContent = leading + translated;
                } else {
                    el.appendChild(document.createTextNode(' ' + translated));
                }
            }
        });
    },

    /**
     * Inject a language toggle button into the page header (right side).
     * Auto-called by AdminCore on page load.
     */
    injectToggle() {
        if (document.querySelector('.admin-lang-toggle')) return;  // idempotent
        const headerRight = document.querySelector('.admin-header .header-right');
        if (!headerRight) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'admin-lang-toggle';
        wrapper.style.cssText = 'display:inline-flex; align-items:center; gap:4px; margin-right:14px; background:#f1f5f9; border-radius:6px; padding:3px; font-size:0.85rem;';

        const langs = [
            { code: 'en', label: 'EN' },
            { code: 'zh', label: '中文' },
        ];
        const current = this.getLang();

        langs.forEach(({ code, label }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.dataset.lang = code;
            btn.style.cssText = 'border:0; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem; transition:all 0.15s;';
            if (code === current) {
                btn.style.background = '#fff';
                btn.style.color = '#0369a1';
                btn.style.fontWeight = '600';
                btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#64748b';
            }
            btn.addEventListener('click', () => {
                AdminI18n.setLang(code);
                // Re-render toggle to update active state
                wrapper.remove();
                AdminI18n.injectToggle();
            });
            wrapper.appendChild(btn);
        });

        headerRight.insertBefore(wrapper, headerRight.firstChild);
    },

    /**
     * Bootstrap on page load. Runs after AdminCore.checkAuth.
     */
    init() {
        document.documentElement.setAttribute('data-admin-lang', this.getLang());
        this.applyAll();
        this.injectToggle();
        // Also localize role badge (rendered by AdminCore.renderUserBadge)
        // Re-render after a tick to overlap with role rendering
        setTimeout(() => this.applyAll(), 50);
    },
};

// Expose globally and bootstrap when DOM is ready
window.AdminI18n = AdminI18n;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdminI18n.init());
} else {
    AdminI18n.init();
}
