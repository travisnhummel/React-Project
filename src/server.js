import express from 'express';
import bodyParser from 'body-parser';
import { MongoClient } from 'mongodb';
import path from 'path';

const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '/build'))); // tells react where to serve static files (images...)

var session = require('client-sessions');
app.use(session({
  cookieName: 'session',
  secret: 'random_string_goes_here',
  duration: 24 * 60 * 60 * 1000, // 1 day
  activeDuration: 60 * 60 * 1000, // 1 hour
  secure: true,
  ephemeral: true
}));

var log4js = require('log4js');
log4js.configure({
    appenders: {
        out:{ type: 'console' },
        app:{ type: 'file', filename: 'logs/file.log' }
    },
    categories: {
        default: { appenders: [ 'out', 'app' ], level: 'debug' }
    }
});
var logger = log4js.getLogger();


// wrap functions around this to use MongoDB
const withDB = async (operations, res) => {
    try {
        const client = await MongoClient.connect('mongodb://localhost:27017', { useNewUrlParser: true });
        const db = client.db('my-blog');
        await operations(db);
        client.close();
    } catch (error) {
        logger.error("MongoDB error : " + error);
        res.status(500).json({ message: 'Error connecting to db', error });
    }
}

// Get articleInfo by name
app.get('/api/articles/:name', async (req, res) => {
    withDB(async (db) => {
        const articleName = req.params.name;

        const articleInfo = await db.collection('articles').findOne({ name : articleName });
        res.status(200).json(articleInfo);
    }, res)
});

// Upvote an article
app.post('/api/articles/:name/upvote', async (req, res) => {
    withDB(async (db) => {
        const articleName = req.params.name;
        const articleInfo = await db.collection('articles').findOne({ name : articleName });
        await db.collection('articles').updateOne({name : articleName}, {
            '$set' : {
                upvotes: articleInfo.upvotes + 1
            }
        });
        const updatedArticle = await db.collection('articles').findOne({ name : articleName });

        res.status(200).json(updatedArticle);
        logger.info("Article", articleName, "was upvoted! Total upvotes:", updatedArticle.upvotes);
    }, res);
});

// Add comment to an article
app.post('/api/articles/:name/add-comment', (req, res) => {
    withDB(async (db) => {
        const { username, text} = req.body;

        const articleName = req.params.name;
        const articleInfo = await db.collection('articles').findOne({ name : articleName });
        await db.collection('articles').updateOne({ name : articleName }, {
            '$set' : {
                comments : articleInfo.comments.concat({ username, text })
            }
        });
        const updatedArticle = await db.collection('articles').findOne({ name : articleName });

        res.status(200).json(updatedArticle);
        logger.info("New comment added to", articleName, ".", username, "said '", text,"'");
    }, res);
});

// Login with username and password
app.post('/api/login', (req, res) => {
    withDB(async (db) => {
        const { username, password } = req.body;
        logger.info(username, "logged in");
        const user = await db.collection('user').findOne({ 'username' : username });
        if (!user) {
            res.status(200).json({ "message" : "DOES_NOT_EXIST" });
        } else if (user.password !== password) {
            res.status(200).json({ "message" : "INCORRECT_PASSWORD" });
        } else {
            req.session.username = username;
            res.status(200).json({ "message" : "SUCCESS" });
        }
    }, res);
});

app.post('/api/logout', (req, res) => {
    logger.info(req.session.username, "logging out");
    req.session.reset();
    res.send("ok");
});

app.post('/api/sign-up', (req, res) => {
    withDB(async (db) => {
        const { username, password } = req.body;
        const user = await db.collection('user').findOne({ 'username' : username });
        if (user) {
            res.status(200).json({ "message" : "User already exists" });
        } else {
            const result = await db.collection('user').insertOne({ username, password });
            if (result.insertedCount === 1) {
                res.status(200).json({ "message" : "SUCCESS" });
                logger.info("New user:", username);
            } else {
                res.status(200).json({ "message" : "Unable to create new user."})
            }
        }
    }, res);
});

app.post('/logger', (req, res) => {
    const { level, text } = req.body;

    if (level === 'INFO') {
        logger.info("FRONTEND:", text);
    } else if (level === 'DEBUG') {
        logger.debug("FRONTEND:", text);
    } else if (level === 'ERROR') {
        logger.error("FRONTEND:", text);
    } else {
        logger.error("Unknown log level from frontend", level, text);
    }
    res.status(200).send();
});

// All requests not caught by API route are passed onto frontend code
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname + '/build/index.html'));
});

app.listen(8000, () => console.log('Listening on port 8000'));