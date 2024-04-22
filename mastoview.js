async function get_masto_thread(url) {
    let posts = {};
    // get the main post
    let data = await (await fetch(url)).json();
    posts[data.id] = data;
    // get the children
    data = await (await fetch(url+'/context')).json();
    const children = data.descendants.concat(data.ancestors);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        posts[child.id] = child;
    }
    return posts;
}

function analyse_masto_thread(the_thread) {
    // iterate over the thread and extract the parent of each post or record if the base
    var basepost = null;
    for(const key in the_thread) {
        const post = the_thread[key];
        if(post.in_reply_to_id === null) {
            basepost = post;
        } else {
            const parent = the_thread[post.in_reply_to_id];
            if(!parent.children) {
                parent.children = [];
            }
            parent.children.push(post);
        }
    }
    // get the number of recursive replies and engagements
    let count_replies_engagements = function(post) {
        if(post.recursive_replies!==undefined) {
            return [post.recursive_replies, post.recursive_engagements];
        }
        post.engagements = post.reblogs_count + post.favourites_count;
        post.recursive_engagements = post.engagements;
        post.recursive_replies = 0;
        if(post.children) {
            post.recursive_replies += post.children.length;
            for(let i = 0; i < post.children.length; i++) {
                [child_replies, child_engagements] = count_replies_engagements(post.children[i]);
                post.recursive_replies += child_replies;
                post.recursive_engagements += child_engagements;
            }
        }
        return [post.recursive_replies, post.recursive_engagements];
    }
    count_replies_engagements(basepost);
    return basepost;
}

function render_masto_thread_linear(basepost) {
    // render the thread
    let add_post_and_children = function(post, indent) {
        const div = document.createElement('div');
        div.classList.add('mastoview-post');
        div.style.marginLeft = indent*4 + 'em';
        // make this display better
        header_html = `<div class="mastoview-post-header"><a href="${post.account.url}"><span class="mastoview-post-author-name">${post.account.display_name}</span> <span class="mastoview-post-author-id">@${post.account.acct}</span></a></div>`;
        footer_text = `🔁 ${post.reblogs_count} ⭐ ${post.favourites_count}`;
        posted_at = new Date(post.created_at);
        footer_text += ` | thread ↩️ ${post.recursive_replies} 🔁⭐ ${post.recursive_engagements}`;
        footer_text += ` | <a class="mastoview-post-date" href="${post.url}">${posted_at.toLocaleString()}</a>`;
        footer_html = `<div class="mastoview-post-footer">${footer_text}</div>`;
        div.innerHTML = header_html+`<div class="mastoview-post-content">${post.content}</div>`+footer_html;
        const div_post_and_replies = document.createElement('div');
        div_post_and_replies.classList.add('mastoview-post-and-replies-container');
        div_post_and_replies.appendChild(div);
        if(post.children) {
            const replies_div = document.createElement('div');
            replies_div.classList.add('mastoview-replies');
            // sort by engagement, make this optional later
            post.children.sort((a, b) => a.recursive_replies+a.recursive_engagements < b.recursive_replies+b.recursive_engagements ? 1 : -1);
            for(let i = 0; i < post.children.length; i++) {
                child_div = add_post_and_children(post.children[i], indent + 1);
                replies_div.appendChild(child_div);
            }
            div_post_and_replies.appendChild(replies_div);
        }
        return div_post_and_replies;
    }
    return add_post_and_children(basepost, 0);
}

function test_mastoview(url) {
    const body = document.querySelector('body');
    get_masto_thread('https://neuromatch.social/api/v1/statuses/112225106987973156')
        .then(the_thread => {
            const basepost = analyse_masto_thread(the_thread);
            const div = render_masto_thread_linear(basepost);
            body.appendChild(div);        
        });
}
