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

function test_mastoview(url) {
    const body = document.querySelector('body');
    get_masto_thread('https://neuromatch.social/api/v1/statuses/112225106987973156')
        .then(the_thread => {
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
            // render the thread
            const basediv = document.createElement('div');
            basediv.classList.add('mastoview-thread');
            let add_post_and_children = function(post, indent) {
                const div = document.createElement('div');
                div.classList.add('mastoview-post');
                div.style.marginLeft = indent*4 + 'em';
                // make this display better
                summary_start = `<p>${post.account.display_name} @${post.account.acct}</p>`;
                summary_start += `<p>${post.reblogs_count} reposts, ${post.favourites_count} favourites.</p>`;
                summary_start += `<p>Reply thread has ${post.recursive_replies} replies, ${post.recursive_engagements} engagements</p>`;
                div.innerHTML = summary_start+post.content;
                basediv.appendChild(div);
                if(post.children) {
                    // sort by engagement, make this optional later
                    post.children.sort((a, b) => a.recursive_replies+a.recursive_engagements < b.recursive_replies+b.recursive_engagements ? 1 : -1);
                    for(let i = 0; i < post.children.length; i++) {
                        add_post_and_children(post.children[i], indent + 1);
                    }
                }
            }
            add_post_and_children(basepost, 0);
            body.appendChild(basediv);        
        });
}
