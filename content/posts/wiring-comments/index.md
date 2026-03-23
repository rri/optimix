+++
title = "Wiring Comments"
date = 2026-03-23T09:30:00-07:00
[taxonomies]
authors = ["Ramnath R Iyer"]
tags = ["blog"]
[extra]
allow_comments = true
+++

For a static blog like this one, supporting comments from readers is not easy. The site is entirely
generated ahead-of-time and published to an [Amazon S3](https://aws.amazon.com/s3/) bucket, made
accessible over [Amazon CloudFront](https://aws.amazon.com/cloudfront/). Without a compute instance,
there is no way to store and retrieve dynamic content like comments. For the most part, I have
considered the *absence* of comments to be a "feature". Recently, however, I decided that reader
engagement wouldn't be so bad after all.

And so, as of yesterday, it is now possible to comment on posts on this blog. I eschewed solutions
like [Disqus](https://disqus.com/) because they pull in cruft I don't care for, and I avoided
systems like [Staticman](https://github.com/eduardoboucas/staticman) as they've become fairly
heavyweight over time.

Instead, I built a custom solution using a free version of [Cloudflare](https://www.cloudflare.com/)
worker. The server-side code is less than 200 lines long (all under the [worker
sub-folder](https://github.com/rri/optimix/tree/master/worker) in my public repository). The
server-side code uses a bot account with GitHub to post incoming comments as *pull requests* to the
repository. Once I review and approve a request, it gets merged into the repository and triggers a
fresh build and deployment of the site. To limit spam, the server-side code has some tricks up its
sleeve, including a spam check with [Akismet](https://akismet.com/) and an in-built honeypot to
catch drive-by spammers.

On the client-side application, I render the comments for each post along with a form to post new
comments. All existing comments are organized as a single new section, but the frontmatter of each
comment indicates which post it belongs to. The rendering logic filters by this information to only
render relevant comments in linear chronological order. New comment submission is, of course,
[handled using
JavaScript](https://github.com/rri/optimix/blob/c454c626311da0ea98232d7d748176c053100752/static/script.js#L223),
and [includes some in-built speedbumps to reduce spam](https://github.com/rri/optimix/blob/c454c626311da0ea98232d7d748176c053100752/static/script.js#L254).

While the current approach works reasonably well in my opinion, a key point of friction is that
comments don't show up for some undefined period of time until they are approved (or never, if the
comment is rejected). Readers submitting comments see a message indicating that the comment has been
submitted and is pending approval, but don't see their own comment rendered on the page until much
later.

