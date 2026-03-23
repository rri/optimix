// Required variables:
// - BLOG       e.g., https://optimix.dev
// - BOT        e.g., optimix-comment-bot
// - REPO       e.g., rri/optimix
// - REVIEWER   e.g., rri
//
// Required secrets:
// - AKISMET_KEY (API key from Akismet)
// - GITHUB_PAT (Personal Access Token from GitHub)
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    try {
      if (request.method === "OPTIONS") return corsResponse(env, 204, origin);
      if (request.method !== "POST") return corsResponse(env, 405, origin, { error: "Method not allowed" });
      // Rate limit by IP.
      const ip = request.headers.get("CF-Connecting-IP");
      const { success } = await env.RATE_LIMIT.limit({ key: ip });
      if (!success) {
        return corsResponse(env, 429, origin, { error: "Too many comments. Try again after a few minutes." });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return corsResponse(env, 400, origin, { error: "Invalid JSON" });
      }
      const { name, comment, parent } = body;
      if (!name?.trim() || !comment?.trim() || !parent?.trim()) {
        return corsResponse(env, 400, origin, { error: "Missing required fields" });
      }
      // Honeypot: silently accept but do nothing.
      if (body.website) {
        return corsResponse(env, 200, origin, { message: "Comment submitted for approval." });
      }
      try {
        // Akismet spam check.
        const spam = await checkSpam(env, {
          name: name.trim(),
          comment: comment.trim(),
          ip,
          userAgent: request.headers.get("User-Agent") || "",
        });
        // Blatant spam: silently drop.
        if (spam.blatant) {
          return corsResponse(env, 200, origin, { message: "Comment submitted for approval." });
        }
        // Create the PR (tagged if likely spam).
        const pr = await createCommentPR(env, name.trim(), comment.trim(), parent.trim(), spam.isSpam);
        return corsResponse(env, 200, origin, { message: "Comment submitted for approval.", prNumber: pr.number });
      } catch (err) {
        console.error(err);
        return corsResponse(env, 500, origin, { error: "Failed to submit comment." });
      }
    }
  } catch (err) {
      console.err("Unhandled error:", err);
      return corsResponse(env, 500, origin, { error: "Server error." });
  }
}

// Akismet.
async function checkSpam(env, { name, comment, ip, userAgent }) {
  const res = await fetch(`https://${env.AKISMET_KEY}.rest.akismet.com/1.1/comment-check`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      blog: `${env.BLOG}`,
      user_ip: ip,
      user_agent: userAgent,
      comment_type: "comment",
      comment_author: name,
      comment_content: comment,
    }),
  });
  const body = await res.text();
  const blatant = res.headers.get("X-akismet-pro-tip") === "discard";
  return { isSpam: body === "true", blatant };
}

// GitHub PR creation.
async function createCommentPR(env, name, comment, parent, isSpam) {
  const ts = Date.now();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  const branchName = `comment/${ts}-${slug}`;

  // Get master HEAD.
  const masterRef = await gh(env, "GET", `/repos/${env.REPO}/git/ref/heads/master`);
  const baseSha = masterRef.object.sha;

  // Create branch.
  await gh(env, "POST", `/repos/${env.REPO}/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  // Create comment file.
  const date = new Date().toISOString();
  const filePath = `content/comments/${ts}-${slug}.md`;
  const fileContent = [
    `+++`,
    `title = "Re: ${parent}"`,
    `date = ${date}`,
    `[taxonomies]`,
    `authors = ["${name}"]`,
    `[extra]`,
    `parent = "${parent}"`,
    `allow_comments = false`,
    `+++`,
    ``,
    comment,
    ``,
  ].join("\n");

  await gh(env, "PUT", `/repos/${env.REPO}/contents/${filePath}`, {
    message: `Comment by ${name} on ${parent}`,
    content: btoa(unescape(encodeURIComponent(fileContent))),
    branch: branchName,
  });

  // Open PR.
  const spamLabel = isSpam ? "⚠️ SPAM — " : "";
  const pr = await gh(env, "POST", `/repos/${env.REPO}/pulls`, {
    title: `${spamLabel}Comment by ${name} on ${parent}`,
    head: branchName,
    base: "master",
    body: `**Author:** ${name}\n**Post:** ${parent}\n**Spam:** ${isSpam ? "likely" : "no"}\n\n---\n\n${comment}`,
  });

  // Request review from repo owner.
  await gh(env, "POST", `/repos/${env.REPO}/pulls/${pr.number}/requested_reviewers`, {
    reviewers: [env.REVIEWER],
  });

  return pr
}

// GitHub API helpers.
async function gh(env, method, path, body) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(`${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": `${env.BOT}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub ${res.status}: ${errBody}`);
  }

  return res.json();
}

// CORS.
function corsResponse(env, status, origin, body) {
  const allowedOrigins = [`${env.BLOG}`, "http://127.0.0.1:1111"];
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers
  });
}
