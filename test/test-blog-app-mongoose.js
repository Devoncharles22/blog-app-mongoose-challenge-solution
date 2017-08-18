const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData( ) {
  console.info('seeding blog post data');
  const seedData = [];
  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  return BlogPost.insertMany(seedData);
}

// generate an object represnting a blog post.
// can be used to generate seed data for db
// or request.body data
function generateBlogPostData() {
  return {
		title: faker.lorem.sentence(),
		content: faker.lorem.text(),
		author: {
			firstName: faker.name.firstName(),
			lastName: faker.name.lastName(),
		}
  	}
};

// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  ata from one test does not stick
// around for next one
function tearDownDb() {
  return new Promise((resolve, reject) => {
    console.warn('Deleting database');
    mongoose.connection.dropDatabase()
      .then(result => resolve(result))
      .catch(err => reject(err))
  });
}

describe('blog post API resource', function() {
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  })

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {
    it('should return all existing blog posts', function() {
      // strategy:
      //    1. get back all blog posts by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of blog posts we got back is equal to number
      // in db.
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.blogPosts.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          res.body.blogPosts.should.have.length(count);
        });
    });

    it('should return blog posts with right fields', function( ) {
      // Strategy: Get back all blog posts, and ensure they have expected keys
      let resBlogPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          res.should.have.status(200);
          res.should.be.json;
          res.body.blogPosts.should.be.a('array');
          res.body.blogPosts.should.have.length.of.at.least(1);
          res.body.blogPosts.forEach(function(blogPost) {
            blogPost.should.be.a('object');
            blogPost.should.include.keys(
              'id', 'title', 'content', 'author', 'created');
          });
          resblogPost = res.body.blogPosts[0];
          return BlogPost.findById(resblogPost.id);
          })
        });
    });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the blog post we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog post', function() {

      const newblogPost = generateBlogPostData();
    
      return chai.request(app)
        .post('/posts')
        .send(newblogPost)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'title', 'content', 'author', 'created');
          res.body.title.should.equal(newblogPost.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.author.should.equal(
            `${newblogPost.author.firstName} ${newblogPost.author.lastName}`);
          res.body.content.should.equal(newblogPost.content);
        })
    });
  });

  describe('PUT endpoint', function() {
    // strategy:
    //  1. Get an existing blog post from db
    //  2. Make a PUT request to update that blog post
    //  3. Prove blog post returned by request contains data we sent
    //  4. Prove blog post in db is correctly updated
     it('should update fields you send over', function( ) {
      const updateData = {
        title: 'There Eyes Where Watching God',
        content: 'Haley Berry',
        author: {
          firstName: 'Zora',
          lastName: 'Hurston'
        }
      };

      return BlogPost
        .findOne()
        .exec()
        .then(function(post) {
          updateData.id = post.id;
          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${post.id}`)
            .send(updateData);
        })
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.title.should.equal(updateData.title);
          res.body.author.should.equal(
            `${updateData.author.firstName} ${updateData.author.lastName}`);
          res.body.content.should.equal(updateData.content);

          return BlogPost.findById(res.body.id).exec();
        })
        .then(function(post) {
          post.title.should.equal(updateData.title);
          post.content.should.equal(updateData.content);
          post.author.firstName.should.equal(updateData.author.firstName);
          post.author.lastName.should.equal(updateData.author.lastName);
        });
      });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a blog post
    //  2. make a DELETE request for that blog post's id
    //  3. assert that response has right status code
    //  4. prove that blog post with the id doesn't exist in db anymore
    it('delete a blog post by id', function() {

      let post;

      return BlogPost
        .findOne()
        .exec()
        .then(function(_post) {
          post = _post;
          return chai.request(app).delete(`/posts/${post.id}`);
        })
        .then(function(res) {
          res.should.have.status(204);
          return BlogPost.findById(post.id).exec();
        })
        .then(function(_post) {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_post.should.be.null` would raise
          // an error. `should.be.null (_post)` is how we can
          // make assertions about a null value.
          should.not.exist(_post);
        });
    });
  });
});

