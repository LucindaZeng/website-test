/**
 * WFX Admin Core System
 * Handles authentication, user management, content management, and activity logging
 */

const AdminCore = {
    // Default admin account
    DEFAULT_ADMIN: {
        id: 1,
        username: 'admin',
        password: 'wfx6688',
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
        companyVideoPoster: 'company-video-poster.jpg',
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
            localStorage.setItem('wfx_homepage_media', JSON.stringify(this.DEFAULT_HOMEPAGE_MEDIA));
        }
        
        // Initialize blog posts
        if (!localStorage.getItem('wfx_blog_posts')) {
            localStorage.setItem('wfx_blog_posts', JSON.stringify([]));
        }
        
        // Initialize news
        if (!localStorage.getItem('wfx_news')) {
            localStorage.setItem('wfx_news', JSON.stringify([]));
        }
        
        // Initialize activity log
        if (!localStorage.getItem('wfx_activity_log')) {
            localStorage.setItem('wfx_activity_log', JSON.stringify([]));
        }
    },

    // ==================== Authentication ====================
    
    login: function(username, password) {
        this.init();
        const users = JSON.parse(localStorage.getItem('wfx_users'));
        const user = users.find(u => u.username === username && u.password === password);
        
        if (user) {
            // Update last login
            user.lastLogin = new Date().toISOString();
            localStorage.setItem('wfx_users', JSON.stringify(users));
            
            // Set session
            localStorage.setItem('wfx_admin_logged_in', 'true');
            localStorage.setItem('wfx_admin_user', JSON.stringify({
                id: user.id,
                username: user.username,
                role: user.role,
                name: user.name
            }));
            
            return true;
        }
        return false;
    },

    logout: function() {
        const user = this.getCurrentUser();
        if (user) {
            this.logAction('logout', 'User logged out', { username: user.username });
        }
        localStorage.removeItem('wfx_admin_logged_in');
        localStorage.removeItem('wfx_admin_user');
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
            author: user ? user.name : 'Admin',
            authorId: user ? user.id : 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            publishedAt: postData.status === 'published' ? new Date().toISOString() : null
        };
        
        posts.push(newPost);
        localStorage.setItem('wfx_blog_posts', JSON.stringify(posts));
        
        this.logAction('blog_created', `Created blog post: ${postData.title}`, { postId: newId });
        
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
        
        this.logAction('blog_updated', `Updated blog post: ${posts[index].title}`, { postId });
        
        return { success: true, post: posts[index] };
    },

    deleteBlogPost: function(postId) {
        const posts = this.getBlogPosts();
        const post = posts.find(p => p.id === postId);
        
        if (post) {
            const filteredPosts = posts.filter(p => p.id !== postId);
            localStorage.setItem('wfx_blog_posts', JSON.stringify(filteredPosts));
            this.logAction('blog_deleted', `Deleted blog post: ${post.title}`, { postId });
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

// Load custom logos when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    AdminCore.loadCustomLogos();
});
