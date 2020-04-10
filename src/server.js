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
  duration: 10 * 1000, // 60 seconds for now, until it's been thoroughly tested
  activeDuration: 5 * 1000,
  secure: true,
  ephemeral: true
}));

// wrap functions around this to use MongoDB
const withDB = async (operations, res) => {
    try {
        const client = await MongoClient.connect('mongodb://localhost:27017', { useNewUrlParser: true });
        const db = client.db('my-blog');

        await operations(db);

        client.close();
    } catch (error) {
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
    }, res);
});

// Login with username and password
app.post('/login', (req, res) => {
    withDB(async (db) => {
        const { username, password } = req.body;
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

app.post('/logout', (req, res) => {
    req.session.reset();
    res.send("ok");
});

// All requests not caught by API route are passed onto frontend code
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname + '/build/index.html'));
});

app.listen(8000, () => console.log('Listening on port 8000'));