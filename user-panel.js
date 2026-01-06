const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');

// Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Bot token from environment variable
const token = process.env.BOT_TOKEN || '8565057887:AAFzGgfn8yncRpeze888-2k0GrLmyKQfFKA';
const bot = new TelegramBot(token, { polling: true });

// Store user states
const userStates = {};
const userData = {};

// Channel check configuration
const FORCE_JOIN = true; // Set from admin panel
const REQUIRED_CHANNELS = ['@yourchannel1', '@yourchannel2'];

// Main menu
const mainMenu = {
    reply_markup: {
        keyboard: [
            ['🛍️ Products', '💰 Free Earning'],
            ['💳 Balance', '📤 Withdraw'],
            ['📥 Deposit', '👥 Referral'],
            ['🆘 Help', '📊 Dashboard']
        ],
        resize_keyboard: true
    }
};

// Check if user joined required channels
async function checkChannels(userId) {
    if (!FORCE_JOIN) return true;
    
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.getChatMember(channel, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return false;
            }
        } catch (error) {
            console.error('Error checking channel:', error);
        }
    }
    return true;
}

// Welcome message
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username;
    const referralCode = msg.text.split(' ')[1];
    
    // Check channel membership
    const hasJoined = await checkChannels(userId);
    if (!hasJoined) {
        const channelList = REQUIRED_CHANNELS.map(ch => `• ${ch}`).join('\n');
        return bot.sendMessage(chatId, 
            `⚠️ *Please join our channels first:*\n\n${channelList}\n\n` +
            `After joining, send /start again.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Register user if new
    const userRef = db.collection('users').doc(userId.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
        const userData = {
            username: username,
            userId: userId,
            balance: 0,
            referrals: 0,
            referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            joinedAt: new Date(),
            totalEarned: 0
        };
        
        // Handle referral
        if (referralCode) {
            const referrerQuery = await db.collection('users')
                .where('referralCode', '==', referralCode)
                .get();
            
            if (!referrerQuery.empty) {
                const referrerId = referrerQuery.docs[0].id;
                userData.referredBy = referrerId;
                
                // Update referrer's count
                await db.collection('users').doc(referrerId).update({
                    referrals: admin.firestore.FieldValue.increment(1),
                    balance: admin.firestore.FieldValue.increment(5) // $5 referral bonus
                });
                
                // Record referral transaction
                await db.collection('transactions').add({
                    userId: referrerId,
                    type: 'referral_bonus',
                    amount: 5,
                    timestamp: new Date(),
                    referredUser: userId
                });
            }
        }
        
        await userRef.set(userData);
        
        // Record transaction
        await db.collection('transactions').add({
            userId: userId,
            type: 'welcome_bonus',
            amount: 1,
            timestamp: new Date()
        });
        
        // Give welcome bonus
        await userRef.update({
            balance: admin.firestore.FieldValue.increment(1)
        });
    }
    
    const welcomeMsg = `👋 *Welcome to our Telegram Bot!*\n\n` +
        `💰 *Balance:* $1.00 (Welcome Bonus)\n` +
        `👥 *Referral Code:* \`${userDoc.exists ? userDoc.data().referralCode : userData.referralCode}\`\n\n` +
        `Use the menu below to navigate:`;
    
    bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: 'Markdown',
        ...mainMenu
    });
});

// Balance command
bot.onText(/💳 Balance/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDoc = await db.collection('users').doc(userId.toString()).get();
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    
    const balanceMsg = `💰 *Your Balance*\n\n` +
        `📊 *Available:* $${userData.balance.toFixed(2)}\n` +
        `👥 *Referrals:* ${userData.referrals || 0}\n` +
        `💎 *Total Earned:* $${userData.totalEarned || 0}\n\n` +
        `🔗 *Your Referral Link:*\n` +
        `https://t.me/yourbot?start=${userData.referralCode}\n\n` +
        `Invite friends and earn $5 for each!`;
    
    bot.sendMessage(chatId, balanceMsg, { parse_mode: 'Markdown' });
});

// Products menu
bot.onText(/🛍️ Products/, async (msg) => {
    const chatId = msg.chat.id;
    
    const productsMenu = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Buy Products', callback_data: 'buy_products' }],
                [{ text: '💰 Sell Products', callback_data: 'sell_products' }],
                [{ text: '📋 My Orders', callback_data: 'my_orders' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, '🛍️ *Products Menu*\n\nChoose an option:', {
        parse_mode: 'Markdown',
        ...productsMenu
    });
});

// Free Earning
bot.onText(/💰 Free Earning/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Get earning links from database
    const linksSnapshot = await db.collection('earningLinks').get();
    const links = [];
    
    linksSnapshot.forEach(doc => {
        links.push(doc.data());
    });
    
    if (links.length === 0) {
        return bot.sendMessage(chatId, 'No earning links available at the moment.');
    }
    
    const keyboard = [];
    links.forEach((link, index) => {
        keyboard.push([{
            text: `${link.title} - $${link.reward}`,
            url: link.link
        }]);
    });
    
    keyboard.push([{ text: '✅ Claim Reward', callback_data: 'claim_earnings' }]);
    
    bot.sendMessage(chatId, '💰 *Free Earning Tasks*\n\nComplete tasks and earn money:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Withdraw command
bot.onText(/📤 Withdraw/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDoc = await db.collection('users').doc(userId.toString()).get();
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    
    // Check minimum withdrawal
    const settingsDoc = await db.collection('settings').doc('withdrawal').get();
    const minWithdrawal = settingsDoc.exists ? settingsDoc.data().minAmount : 5;
    
    if (userData.balance < minWithdrawal) {
        return bot.sendMessage(chatId, 
            `❌ *Minimum withdrawal is $${minWithdrawal}*\n\n` +
            `Your current balance: $${userData.balance.toFixed(2)}`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Ask for withdrawal method
    const methodsKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'bKash', callback_data: 'withdraw_bkash' }],
                [{ text: 'Nagad', callback_data: 'withdraw_nagad' }],
                [{ text: 'Binance', callback_data: 'withdraw_binance' }],
                [{ text: 'Crypto (USDT)', callback_data: 'withdraw_crypto' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, 
        `💳 *Withdraw Funds*\n\n` +
        `💰 *Available:* $${userData.balance.toFixed(2)}\n` +
        `📊 *Minimum:* $${minWithdrawal}\n\n` +
        `Choose withdrawal method:`,
        { parse_mode: 'Markdown', ...methodsKeyboard }
    );
});

// Deposit command
bot.onText(/📥 Deposit/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Get payment methods from database
    const paymentDoc = await db.collection('settings').doc('paymentMethods').get();
    const methods = paymentDoc.exists ? paymentDoc.data() : {};
    
    let depositMsg = `💳 *Deposit Funds*\n\n`;
    depositMsg += `*Available Methods:*\n\n`;
    
    if (methods.bkash) depositMsg += `📱 *bKash:* ${methods.bkash}\n`;
    if (methods.nagad) depositMsg += `📲 *Nagad:* ${methods.nagad}\n`;
    if (methods.binance) depositMsg += `💰 *Binance:* ${methods.binance}\n`;
    if (methods.usdt) depositMsg += `₿ *USDT (TRC20):* ${methods.usdt}\n`;
    if (methods.btc) depositMsg += `₿ *BTC:* ${methods.btc}\n`;
    
    depositMsg += `\n*Instructions:*\n`;
    depositMsg += `1. Send money to any account above\n`;
    depositMsg += `2. Take screenshot of payment\n`;
    depositMsg += `3. Send screenshot here with amount\n\n`;
    depositMsg += `✅ Your balance will be updated within 5 minutes`;
    
    bot.sendMessage(chatId, depositMsg, { parse_mode: 'Markdown' });
});

// Referral system
bot.onText(/👥 Referral/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDoc = await db.collection('users').doc(userId.toString()).get();
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    
    const referralMsg = `👥 *Referral System*\n\n` +
        `🔗 *Your Referral Code:*\n\`${userData.referralCode}\`\n\n` +
        `🌐 *Your Referral Link:*\n` +
        `https://t.me/yourbot?start=${userData.referralCode}\n\n` +
        `💰 *Earn $5 for each referral*\n\n` +
        `📊 *Stats:*\n` +
        `• Total Referrals: ${userData.referrals || 0}\n` +
        `• Referral Earnings: $${(userData.referrals || 0) * 5}\n\n` +
        `*How it works:*\n` +
        `1. Share your referral link\n` +
        `2. When someone joins using your link\n` +
        `3. You get $5 instantly!`;
    
    bot.sendMessage(chatId, referralMsg, { parse_mode: 'Markdown' });
});

// Help command
bot.onText(/🆘 Help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMsg = `🆘 *Help & Support*\n\n` +
        `*Available Commands:*\n` +
        `/start - Start the bot\n` +
        `/help - Show this message\n` +
        `/balance - Check your balance\n` +
        `/referral - Referral system info\n\n` +
        `*Features:*\n` +
        `• Buy/Sell Products\n` +
        `• Free Earning Tasks\n` +
        `• Instant Withdrawal\n` +
        `• Referral System\n\n` +
        `*Support:*\n` +
        `Contact @admin_username for help`;
    
    bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
});

// Dashboard
bot.onText(/📊 Dashboard/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDoc = await db.collection('users').doc(userId.toString()).get();
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    
    // Get recent transactions
    const transactionsSnapshot = await db.collection('transactions')
        .where('userId', '==', userId.toString())
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();
    
    let transactions = '';
    transactionsSnapshot.forEach(doc => {
        const trans = doc.data();
        transactions += `• ${trans.type}: $${trans.amount} (${new Date(trans.timestamp).toLocaleDateString()})\n`;
    });
    
    const dashboardMsg = `📊 *Your Dashboard*\n\n` +
        `👤 *User ID:* ${userId}\n` +
        `💰 *Balance:* $${userData.balance.toFixed(2)}\n` +
        `👥 *Referrals:* ${userData.referrals || 0}\n` +
        `💎 *Total Earned:* $${userData.totalEarned || 0}\n\n` +
        `📈 *Recent Transactions:*\n${transactions || 'No transactions yet'}\n\n` +
        `*Quick Actions:*`;
    
    const dashboardKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Refresh', callback_data: 'refresh_dashboard' }],
                [{ text: '📊 Full Stats', callback_data: 'full_stats' }],
                [{ text: '🎯 Achievement', callback_data: 'achievements' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, dashboardMsg, {
        parse_mode: 'Markdown',
        ...dashboardKeyboard
    });
});

// Callback queries
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    if (data === 'claim_earnings') {
        // Random earning between $0.10 and $1.00
        const earnings = (Math.random() * 0.9 + 0.1).toFixed(2);
        
        await db.collection('users').doc(userId.toString()).update({
            balance: admin.firestore.FieldValue.increment(parseFloat(earnings)),
            totalEarned: admin.firestore.FieldValue.increment(parseFloat(earnings))
        });
        
        // Record transaction
        await db.collection('transactions').add({
            userId: userId.toString(),
            type: 'task_earning',
            amount: parseFloat(earnings),
            timestamp: new Date()
        });
        
        bot.answerCallbackQuery(callbackQuery.id, {
            text: `✅ You earned $${earnings}!`
        });
        
        bot.editMessageText(`💰 *Earning Claimed!*\n\nYou earned $${earnings} from completing tasks.`, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });
    }
});

// Handle photo messages for deposit proof
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    
    // Ask for amount
    bot.sendMessage(chatId, 'Please send the deposit amount:');
    userStates[userId] = 'awaiting_deposit_amount';
    userData[userId] = { photoId: photoId };
});

// Handle text messages for deposit amount
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (userStates[userId] === 'awaiting_deposit_amount') {
        const amount = parseFloat(text);
        
        if (isNaN(amount) || amount <= 0) {
            return bot.sendMessage(chatId, 'Please enter a valid amount.');
        }
        
        // Save deposit request
        await db.collection('deposits').add({
            userId: userId.toString(),
            amount: amount,
            screenshot: userData[userId].photoId,
            status: 'pending',
            timestamp: new Date()
        });
        
        // Notify admin channel
        const adminChannel = '@yourchannel'; // Get from database
        const adminMsg = `📥 *New Deposit Request*\n\n` +
            `👤 User: @${msg.from.username || 'N/A'} (${userId})\n` +
            `💰 Amount: $${amount}\n` +
            `📸 Screenshot: Available`;
        
        bot.sendMessage(adminChannel, adminMsg, { parse_mode: 'Markdown' });
        
        bot.sendMessage(chatId, 
            `✅ *Deposit request submitted!*\n\n` +
            `💰 Amount: $${amount}\n` +
            `⏳ Status: Pending approval\n\n` +
            `Your balance will be updated within 30 minutes.`,
            { parse_mode: 'Markdown' }
        );
        
        delete userStates[userId];
        delete userData[userId];
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Start bot
console.log('🤖 Telegram Bot is running...');
