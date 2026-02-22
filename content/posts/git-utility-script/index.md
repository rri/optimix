+++
title = "Git Utility Script"
date = 2026-02-22T09:25:00-08:00
[taxonomies]
authors = ["Ramnath R Iyer"]
tags = ["git", "scripts"]
[extra]
allow_comments = true
+++

I wrote a little shell script to scratch an itch: [git-squash-paths](https://github.com/rri/git-squash-paths).

Its [README.md](https://github.com/rri/git-squash-paths#readme) file on GitHub explains my motivation behind the writing this script.

What the exercise highlighted to me, however, was that we lack a notion of strong portability of patches across contexts. Strong portability would mean that we're able to safely re-arrange patches to rebuild context in different ways. But patches tend to be highly context-dependent today, both syntactically (e.g. diffs depending on adjacent lines) and semantically (e.g. update to X applying only if Y has a specific definition). Furthermore, dependencies are loosely managed: changes in the same patch are implied to be related (but may not be), and changes across patches may or may not be truly dependent on each other (i.e., requiring a specific order of update).
