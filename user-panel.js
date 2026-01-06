// user-panel.js
const { Telegraf, Markup } = require('telegraf');
const { db, collection, doc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy } = require('./firebase-config');

// Bot Token (You need to set this from @BotFather)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Store user states
const userStates = new Map();

// Main menu
const mainMenu = Markup.keyboard([
    ['💰 Balance', '🎁 Free Earning'],
    ['🛍 Products', '👥 Referral'],
    ['📤 Withdraw', '💳 Deposit'],
    ['ℹ️ Help', '📞 Support']
]).resize();

// Admin menu (for admin only)
const adminMenu = Markup.keyboard([
    ['📊 Statistics', '👤 Users List'],
    ['⚙️ Settings', '📢 Broadcast'],
    ['🔙 Main Menu']
]).resize();

// Product categories keyboard
const productCategories = Markup.inlineKeyboard([
    [
        Markup.button.callback('📱 Electronics', 'category_electronics'),
        Markup.button.callback('👕 Fashion', 'category_fashion')
    ],
    [
        Markup.button.callback('💄 Beauty', 'category_beauty'),
        Markup.button.callback('🏠 Home', 'category_home')
    ],
    [
        Markup.button.callback('🎮 Games', 'category_games'),
        Markup.button.callback('📚 Books', 'category_books')
    ]
]);

// Start command
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    
    // Check if user is joining from referral
    const referralCode = ctx.payload;
    
    // Save user to database
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
        // New user
        await setDoc(userRef, {
            userId: userId,
            username: username,
            balance: 0,
            referrals: 0,
            referralCode: generateReferralCode(),
            referredBy: referralCode || null,
            isActive: true,
            joinedAt: new Date(),
            lastActive: new Date()
        });
        
        // If referred by someone, give bonus
        if (referralCode) {
            const referrerRef = doc(db, 'users', referralCode);
            const referrerDoc = await getDoc(referrerRef);
            
            if (referrerDoc.exists()) {
                const referrerData = referrerDoc.data();
                const referralBonus = await getSetting('referralBonus') || 50;
                
                // Update referrer's balance and referral count
                await updateDoc(referrerRef, {
                    balance: (referrerData.balance || 0) + referralBonus,
                    referrals: (referrerData.referrals || 0) + 1
                });
                
                // Create referral transaction
                const transactionRef = doc(collection(db, 'transactions'));
                await setDoc(transactionRef, {
                    userId: referralCode,
                    type: 'referral',
                    amount: referralBonus,
                    status: 'approved',
                    description: `Referral bonus from @${username}`,
                    timestamp: new Date()
                });
            }
        }
        
        // Check channel join requirement
        const forceJoin = await getSetting('forceJoin');
        if (forceJoin) {
            const channels = await getChannels();
            const joinMessage = await checkChannelJoin(ctx, userId, channels);
            if (joinMessage) {
                return ctx.reply(joinMessage);
            }
        }
        
        // Send welcome message
        const welcomeMessage = await getSetting('welcomeMessage') || 
            `Welcome @${username} to our bot! 🎉\n\n` +
            `Your balance: ৳0\n` +
            `Your referral code: ${(await getDoc(userRef)).data().referralCode}\n\n` +
            `Share your referral link to earn money!`;
        
        ctx.reply(welcomeMessage, mainMenu);
    } else {
        // Existing user
        await updateDoc(userRef, {
            lastActive: new Date()
        });
        
        ctx.reply(`Welcome back @${username}! 👋`, mainMenu);
    }
});

// Balance command
bot.hears('💰 Balance', async (ctx) => {
    const userId = ctx.from.id;
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
        const userData = userDoc.data();
        const message = 
            `💰 Your Balance\n\n` +
            `Available: ৳${userData.balance || 0}\n` +
            `Pending: ৳0\n` +
            `Total Earned: ৳${userData.totalEarned || 0}\n\n` +
            `👥 Referrals: ${userData.referrals || 0}\n` +
            `Your Code: ${userData.referralCode}\n\n` +
            `Share this link: https://t.me/${ctx.botInfo.username}?start=${userData.referralCode}`;
        
        ctx.reply(message);
    }
});

// Free Earning command
bot.hears('🎁 Free Earning', async (ctx) => {
    const links = await getEarningLinks();
    
    if (links.length === 0) {
        return ctx.reply('No earning links available at the moment. Check back later!');
    }
    
    const message = `🎁 Free Earning Links\n\n` +
        `Complete tasks to earn money!\n\n` +
        `${links.map((link, index) => 
            `${index + 1}. ${link.title}\n` +
            `   Reward: ৳${link.reward}\n` +
            `   Link: ${link.url}\n`
        ).join('\n')}`;
    
    ctx.reply(message);
});

// Products command
bot.hears('🛍 Products', async (ctx) => {
    const products = await getProducts();
    
    if (products.length === 0) {
        return ctx.reply('No products available at the moment.');
    }
    
    const message = `🛍 Available Products\n\n` +
        `Select a category:`;
    
    ctx.reply(message, productCategories);
});

// Referral command
bot.hears('👥 Referral', async (ctx) => {
    const userId = ctx.from.id;
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
        const userData = userDoc.data();
        const referralBonus = await getSetting('referralBonus') || 50;
        
        const message = 
            `👥 Referral System\n\n` +
            `Invite friends and earn ৳${referralBonus} for each successful referral!\n\n` +
            `Your Referral Code: ${userData.referralCode}\n` +
            `Your Referrals: ${userData.referrals || 0}\n` +
            `Earned from Referrals: ৳${userData.referralEarnings || 0}\n\n` +
            `📢 Your Referral Link:\n` +
            `https://t.me/${ctx.botInfo.username}?start=${userData.referralCode}\n\n` +
            `Share this link with your friends!`;
        
        ctx.reply(message);
    }
});

// Withdraw command
bot.hears('📤 Withdraw', async (ctx) => {
    const userId = ctx.from.id;
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
        const userData = userDoc.data();
        const minWithdraw = await getSetting('minWithdraw') || 100;
        const maxWithdraw = await getSetting('maxWithdraw') || 5000;
        
        if (userData.balance < minWithdraw) {
            return ctx.reply(`Minimum withdraw amount is ৳${minWithdraw}. Your current balance is ৳${userData.balance}`);
        }
        
        userStates.set(userId, 'awaiting_withdraw_method');
        
        const methods = await getPaymentMethods('withdraw');
        const keyboard = Markup.inlineKeyboard(
            methods.map(method => 
                [Markup.button.callback(method.name, `withdraw_${method.id}`)]
            )
        );
        
        ctx.reply(
            `📤 Withdraw Money\n\n` +
            `Available Balance: ৳${userData.balance}\n` +
            `Minimum: ৳${minWithdraw}\n` +
            `Maximum: ৳${maxWithdraw}\n\n` +
            `Select withdrawal method:`,
            keyboard
        );
    }
});

// Deposit command
bot.hears('💳 Deposit', async (ctx) => {
    const methods = await getPaymentMethods('deposit');
    
    const keyboard = Markup.inlineKeyboard(
        methods.map(method => 
            [Markup.button.callback(`${method.name}`, `deposit_${method.id}`)]
        )
    );
    
    ctx.reply(
        `💳 Deposit Money\n\n` +
        `Select deposit method:\n` +
        `Minimum deposit: ৳50\n` +
        `Maximum deposit: ৳50000`,
        keyboard
    );
});

// Handle callback queries
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    
    if (data.startsWith('category_')) {
        const category = data.split('_')[1];
        await showCategoryProducts(ctx, category);
    }
    else if (data.startsWith('withdraw_')) {
        const methodId = data.split('_')[1];
        await handleWithdrawMethod(ctx, userId, methodId);
    }
    else if (data.startsWith('deposit_')) {
        const methodId = data.split('_')[1];
        await handleDepositMethod(ctx, userId, methodId);
    }
    else if (data.startsWith('product_')) {
        const productId = data.split('_')[1];
        await showProductDetails(ctx, productId);
    }
    
    await ctx.answerCbQuery();
});

// Product details function
async function showProductDetails(ctx, productId) {
    const productRef = doc(db, 'products', productId);
    const productDoc = await getDoc(productRef);
    
    if (productDoc.exists()) {
        const product = productDoc.data();
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('🛒 Buy Now', `buy_${productId}`),
                Markup.button.callback('💬 Contact Seller', `contact_${productId}`)
            ],
            [Markup.button.callback('🔙 Back to Categories', 'back_categories')]
        ]);
        
        const message = 
            `🛍 Product Details\n\n` +
            `Name: ${product.name}\n` +
            `Price: ৳${product.price}\n` +
            `Category: ${product.category}\n\n` +
            `Description:\n${product.description}\n\n` +
            `Seller: @${product.seller || 'admin'}\n` +
            `Rating: ${product.rating || 'Not rated yet'}`;
        
        if (product.image) {
            ctx.replyWithPhoto(product.image, {
                caption: message,
                ...keyboard
            });
        } else {
            ctx.reply(message, keyboard);
        }
    }
}

// Withdraw method handler
async function handleWithdrawMethod(ctx, userId, methodId) {
    const methodRef = doc(db, 'paymentMethods', methodId);
    const methodDoc = await getDoc(methodRef);
    
    if (methodDoc.exists()) {
        const method = methodDoc.data();
        userStates.set(userId, `awaiting_withdraw_amount_${methodId}`);
        
        ctx.reply(
            `Selected: ${method.name}\n\n` +
            `${method.instructions || ''}\n\n` +
            `Enter amount to withdraw:`
        );
    }
}

// Deposit method handler
async function handleDepositMethod(ctx, userId, methodId) {
    const methodRef = doc(db, 'paymentMethods', methodId);
    const methodDoc = await getDoc(methodRef);
    
    if (methodDoc.exists()) {
        const method = methodDoc.data();
        
        const message = 
            `💳 Deposit via ${method.name}\n\n` +
            `Send money to:\n` +
            `${method.details || ''}\n\n` +
            `Minimum: ৳${method.minAmount || 50}\n` +
            `Maximum: ৳${method.maxAmount || 50000}\n\n` +
            `After sending, please provide:\n` +
            `1. Transaction ID\n` +
            `2. Amount\n` +
            `3. Screenshot\n\n` +
            `Reply with this information to complete deposit.`;
        
        userStates.set(userId, 'awaiting_deposit_info');
        ctx.reply(message);
    }
}

// Handle text messages
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userStates.get(userId);
    
    if (state && state.startsWith('awaiting_withdraw_amount_')) {
        const methodId = state.split('_').pop();
        const amount = parseFloat(text);
        
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('Please enter a valid amount.');
        }
        
        const userRef = doc(db, 'users', userId.toString());
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const minWithdraw = await getSetting('minWithdraw') || 100;
            const maxWithdraw = await getSetting('maxWithdraw') || 5000;
            
            if (amount < minWithdraw) {
                return ctx.reply(`Minimum withdraw amount is ৳${minWithdraw}`);
            }
            if (amount > maxWithdraw) {
                return ctx.reply(`Maximum withdraw amount is ৳${maxWithdraw}`);
            }
            if (amount > userData.balance) {
                return ctx.reply(`Insufficient balance. Available: ৳${userData.balance}`);
            }
            
            // Process withdrawal
            userStates.delete(userId);
            const transactionRef = doc(collection(db, 'transactions'));
            
            await setDoc(transactionRef, {
                userId: userId.toString(),
                type: 'withdraw',
                amount: amount,
                method: methodId,
                status: 'pending',
                timestamp: new Date(),
                username: ctx.from.username
            });
            
            // Update user balance
            await updateDoc(userRef, {
                balance: userData.balance - amount
            });
            
            ctx.reply(
                `✅ Withdrawal request submitted!\n\n` +
                `Amount: ৳${amount}\n` +
                `Status: Pending\n\n` +
                `We will process your request within 24 hours.`
            );
            
            // Notify admin
            await notifyAdmin(`New withdrawal request!\nUser: @${ctx.from.username}\nAmount: ৳${amount}`);
        }
    }
    else if (state === 'awaiting_deposit_info') {
        // Process deposit information
        userStates.delete(userId);
        
        const transactionRef = doc(collection(db, 'transactions'));
        await setDoc(transactionRef, {
            userId: userId.toString(),
            type: 'deposit',
            amount: 0, // Will be updated after verification
            description: text,
            status: 'pending',
            timestamp: new Date(),
            username: ctx.from.username
        });
        
        ctx.reply(
            `✅ Deposit information received!\n\n` +
            `We will verify your payment within 1 hour.\n` +
            `You will be notified once approved.`
        );
        
        // Notify admin with photo if available
        await notifyAdmin(`New deposit request!\nUser: @${ctx.from.username}\nDetails: ${text}`);
    }
});

// Helper functions
async function getSetting(key) {
    const settingRef = doc(db, 'settings', key);
    const settingDoc = await getDoc(settingRef);
    
    if (settingDoc.exists()) {
        return settingDoc.data().value;
    }
    return null;
}

async function getChannels() {
    const channelsSnapshot = await getDocs(collection(db, 'channels'));
    return channelsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getEarningLinks() {
    const linksSnapshot = await getDocs(query(
        collection(db, 'earningLinks'),
        where('isActive', '==', true)
    ));
    return linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getProducts(category = null) {
    let q = collection(db, 'products');
    if (category) {
        q = query(q, where('category', '==', category));
    }
    q = query(q, where('isActive', '==', true));
    
    const productsSnapshot = await getDocs(q);
    return productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPaymentMethods(type) {
    const methodsSnapshot = await getDocs(query(
        collection(db, 'paymentMethods'),
        where('type', '==', type),
        where('isActive', '==', true)
    ));
    return methodsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function checkChannelJoin(ctx, userId, channels) {
    try {
        for (const channel of channels) {
            const member = await ctx.telegram.getChatMember(channel.chatId, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return `Please join our channel first: ${channel.link}`;
            }
        }
        return null;
    } catch (error) {
        console.error('Error checking channel join:', error);
        return null;
    }
}

async function showCategoryProducts(ctx, category) {
    const products = await getProducts(category);
    
    if (products.length === 0) {
        return ctx.reply(`No products available in ${category} category.`);
    }
    
    const keyboard = Markup.inlineKeyboard(
        products.map(product => 
            [Markup.button.callback(product.name, `product_${product.id}`)]
        ).concat([[Markup.button.callback('🔙 Back to Categories', 'back_categories')]])
    );
    
    ctx.reply(
        `🛍 Products in ${category}\n\n` +
        `Select a product to view details:`,
        keyboard
    );
}

async function notifyAdmin(message) {
    const adminId = await getSetting('adminTelegramId');
    const channel = await getSetting('notificationChannel');
    
    if (adminId) {
        try {
            await bot.telegram.sendMessage(adminId, message);
        } catch (error) {
            console.error('Error notifying admin:', error);
        }
    }
    
    if (channel) {
        try {
            await bot.telegram.sendMessage(channel, message);
        } catch (error) {
            console.error('Error notifying channel:', error);
        }
    }
}

function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Error handling
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('An error occurred. Please try again later.');
});

// Start bot
bot.launch()
    .then(() => {
        console.log('Bot started successfully');
    })
    .catch(err => {
        console.error('Failed to start bot:', err);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
