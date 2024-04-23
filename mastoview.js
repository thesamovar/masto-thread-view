////////////////////////// MASTODON THREAD LOADING AND ANALYSIS ////////////

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

function sort_hierarchy_by_engagement(post) {
    if(post.children) {
        post.children.sort((a, b) => a.recursive_replies+a.recursive_engagements < b.recursive_replies+b.recursive_engagements ? 1 : -1);
        for(let i = 0; i < post.children.length; i++) {
            sort_hierarchy_by_engagement(post.children[i]);
        }
    }
}

////////////////////////// POST RENDERING ///////////////////////////////////

function render_post(post, fixed_height=false) {
    // todo: remove all the @username from the beginning and end of each masto post, just to make it look nicer. Not entirely trivial to do this.
    const div = document.createElement('div');
    div.classList.add('mastoview-post');
    header_html = `<div class="mastoview-post-header"><a href="${post.account.url}"><span class="mastoview-post-author-name">${post.account.display_name}</span> <span class="mastoview-post-author-id">@${post.account.acct}</span></a></div>`;
    footer_text = `🔁 ${post.reblogs_count} ⭐ ${post.favourites_count}`;
    posted_at = new Date(post.created_at);
    footer_text += ` | thread ↩️ ${post.recursive_replies} 🔁⭐ ${post.recursive_engagements}`;
    footer_text += ` | <a class="mastoview-post-date" href="${post.url}">${posted_at.toLocaleString()}</a>`;
    footer_html = `<div class="mastoview-post-footer">${footer_text}</div>`;
    if(fixed_height) {
        div.innerHTML = header_html+`<div class="mastoview-post-content-fixed-height">${post.content}</div>`+footer_html;
    } else {
        div.innerHTML = header_html+`<div class="mastoview-post-content">${post.content}</div>`+footer_html;
    }
    return div;
}

////////////////////////// LINEAR VIEW AND HELPERS //////////////////////////

function render_masto_thread_linear(basepost, the_thread) {
    sort_hierarchy_by_engagement(basepost);
    // render the thread
    let add_post_and_children = function(post, indent) {
        const post_div = render_post(post);
        post_div.style.marginLeft = indent*40 + 'px';
        const div_post_and_replies = document.createElement('div');
        div_post_and_replies.classList.add('mastoview-post-and-replies-container');
        div_post_and_replies.appendChild(post_div);
        if(post.children) {
            const replies_div = document.createElement('div');
            replies_div.classList.add('mastoview-replies');
            // create expand button
            const replies_expand = document.createElement('div');
            replies_expand.classList.add('mastoview-replies-expand');
            replies_expand.style.marginLeft = (indent+1)*40 + 'px';
            const replies_thread_text = `Replies thread: ↩️ ${post.recursive_replies} 🔁⭐ ${post.recursive_engagements}`;
            replies_expand.innerHTML = "↕ "+replies_thread_text;
            replies_expand.onclick = function() {
                replies_div.classList.toggle('hidden');
            };
            div_post_and_replies.appendChild(replies_expand);
            // sort by engagement, make this optional later
            for(let i = 0; i < post.children.length; i++) {
                child_div = add_post_and_children(post.children[i], indent + 1);
                replies_div.appendChild(child_div);
            }
            div_post_and_replies.appendChild(replies_div);
        }
        return div_post_and_replies;
    }
    const container_div = document.createElement('div');
    document.createElement('button');
    container_div.innerHTML = '<button id="mastoview-expand-all" onclick="expand_all_masto_thread()">Expand all</button> <button id="mastoview-collapse-all" onclick="collapse_all_masto_thread()">Collapse all</button>';
    container_div.appendChild(add_post_and_children(basepost, 0));
    return container_div;
}

function collapse_all_masto_thread() {
    const replies = document.querySelectorAll('.mastoview-replies');
    for(let i = 0; i < replies.length; i++) {
        replies[i].classList.add('hidden');
    }
}

function expand_all_masto_thread() {
    const replies = document.querySelectorAll('.mastoview-replies');
    for(let i = 0; i < replies.length; i++) {
        replies[i].classList.remove('hidden');
    }
}

////////////////////////// TABLE VIEW //////////////////////////////////////

function render_masto_thread_table(basepost, the_thread) {
    sort_hierarchy_by_engagement(basepost);
    // compute grid placement of posts
    grid = {};
    connections = []
    let compute_grid_placement = function(post, row, col) {
        grid[[row, col]] = post;
        let width=1, height=0;
        if(post.children) {
            let cur_row = row;
            let cur_col = col+1;
            for(let i = 0; i < post.children.length; i++) {
                [child_width, child_height] = compute_grid_placement(post.children[i], cur_row, cur_col);
                width = Math.max(width, 1+child_width);
                height += child_height;
                if(i!=post.children.length-1) {
                    post.children[i].has_next_sibling = true;
                    for(let j=cur_row+1; j<cur_row+child_height; j++) {
                        grid[[j, cur_col]] = '|'
                    }
                }
                cur_row += child_height;
            }
        }
        if(height==0) {
            height = 1;
        }
        return [width, height];
    }
    const [width, height] = compute_grid_placement(basepost, 0, 0);
    // render the thread
    const table = document.createElement('table');
    table.classList.add('mastoview-table');
    for(let i = 0; i < height; i++) {
        const row = table.insertRow();
        for(let j = 0; j < width; j++) {
            const cell = row.insertCell();
            if(grid[[i, j]]) {
                if(grid[[i, j]]=='|') {
                    cell.classList.add('mastoview-table-vertical-line');
                } else {
                    const postdiv = render_post(grid[[i, j]], true)
                    cell.appendChild(postdiv);
                    if(grid[[i, j+1]] && grid[[i, j+1]]!='|') {
                        const icon = document.createElement('div');
                        icon.classList.add('connect-right');
                        cell.appendChild(icon);
                    }
                    if(grid[[i, j]].has_next_sibling) {
                        const icon = document.createElement('div');
                        if(grid[[i+1, j]]=='|') {
                            icon.classList.add('connect-down-thin');
                        } else {
                            icon.classList.add('connect-down-fat');
                        }
                        cell.appendChild(icon);
                    }
                }
            } else {
                cell.innerHTML = '<div class="vline">&nbsp;</div>';
            }
        }
    }
    return table;
}

////////////////////////// COMMON TO ALL METHODS //////////////////////////

function get_api_url_from_masto_url(url) {
    const url_parts = url.split('/');
    return url_parts[0]+'//'+url_parts[2]+'/api/v1/statuses/'+url_parts[4];
}

function mastoview_load_and_render(url, render_func) {
    const api_url = get_api_url_from_masto_url(url);
    const container = document.querySelector('#mastoview-thread');
    container.innerHTML = '<div class="loading_thread">Loading thread, please wait...</a>'
    get_masto_thread(api_url)
        .then(the_thread => {
            const basepost = analyse_masto_thread(the_thread);
            const div = render_func(basepost, the_thread);
            container.innerHTML = '';
            container.appendChild(div);        
        });
}
