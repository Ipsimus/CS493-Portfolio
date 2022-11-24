const router = module.exports = require('express').Router();

router.use('/boats', require('./controllers/boatsController'));
router.use('/loads', require('./controllers/loadsController'));
router.use('/users', require('./controllers/usersController'));
router.use('/', require('./controllers/authController'));