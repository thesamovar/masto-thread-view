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
        post.direct_engagements = post.engagements+post.replies_count;
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
    compute_max_direct_engagements(the_thread);
    return basepost;
}

function compute_max_direct_engagements(the_thread) {
    let max_engagement = 0;
    for(const key in the_thread) {
        const post = the_thread[key];
        if(post.direct_engagements > max_engagement) {
            max_engagement = post.direct_engagements;
        }
    }
    for(const key in the_thread) {
        the_thread[key].max_direct_engagements = max_engagement;
    }
    return max_engagement;
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

function render_post(post, fixed_height=false, colour_by_engagement=true) {
    // todo: remove all the @username from the beginning and end of each masto post, just to make it look nicer. Not entirely trivial to do this.
    const div = document.createElement('div');
    div.classList.add('mastoview-post');
    if(colour_by_engagement) {
        const engagement = post.direct_engagements;
        const max_engagement = post.max_direct_engagements;
        //const c = Math.log(1+engagement)/Math.log(1+max_engagement);
        const c = engagement/max_engagement;
        const sat = Math.round(80*c);
        div.style.backgroundColor = `hsl(50, ${sat}%, 50%)`;
    }
    header_html = `<div class="mastoview-post-header"><img src="${post.account.avatar}" class="mastoview-avatar"><a href="${post.account.url}"><span class="mastoview-post-author-name">${post.account.display_name}</span> <span class="mastoview-post-author-id">@${post.account.acct}</span></a></div>`;
    footer_text = `🔁 ${post.reblogs_count} ⭐ ${post.favourites_count}`;
    posted_at = new Date(post.created_at);
    footer_text += ` | thread ↩️ ${post.recursive_replies} 🔁⭐ ${post.recursive_engagements}`;
    footer_text += ` | <a class="mastoview-post-date" href="${post.url}">${posted_at.toLocaleString()}</a>`;
    footer_html = `<div class="mastoview-post-footer">${footer_text}</div>`;
    let post_content = post.content;
    if(post.media_attachments) {
        for(let i = 0; i < post.media_attachments.length; i++) {
            console.log(post.media_attachments[i].remote_url);
            post_content += `<img src="${post.media_attachments[i].remote_url}" class="mastoview-post-media">`;
        }
    }
    if(post.card) {
        post_content += `<div class="mastoview-post-card">${post.card.html}</div>`;
    }
    if(fixed_height) {
        div.innerHTML = header_html+`<div class="mastoview-post-content-fixed-height">${post_content}</div>`+footer_html;
    } else {
        div.innerHTML = header_html+`<div class="mastoview-post-content">${post_content}</div>`+footer_html;
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
    container_div.innerHTML = '<button id="mastoview-expand-all" onclick="expand_all_masto_thread()">Expand all</button> <button id="mastoview-collapse-all" onclick="collapse_all_masto_thread()">Collapse all</button> <button onclick="mastoview_remove_max_height()">Remove max height restriction</button>';
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

function mastoview_remove_max_height() {
    const posts = document.querySelectorAll('.mastoview-post-content');
    for(let i = 0; i < posts.length; i++) {
        posts[i].style.maxHeight = 'none';
    }
}

////////////////////////// TABLE VIEW //////////////////////////////////////

// Crazy that this isn't just how Javascript Map works but there you go
class TupleMap {
    constructor() {
        this.map = new Map();
    }
    set(key, value) {
        this.map.set(JSON.stringify(key), value);
        return this;
    }
    get(key) {
        return this.map.get(JSON.stringify(key));
    }
    has(key) {
        return this.map.has(JSON.stringify(key));
    }
    keys() {
        return Array.from(this.map.keys(), k => JSON.parse(k));
    }
}

function compressed_grid_placement(post) {
    let grid = new TupleMap();
    grid.set([0, 0], post);
    if(post.children) {
        let row = 0;
        let col = 1;
        for(let i = 0; i < post.children.length; i++) {
            const child = post.children[i];
            if(i!=post.children.length-1) {
                child.has_next_sibling = true;
            }
            const child_grid = compressed_grid_placement(child);
            // check if child grid can be placed at current position, otherwise move down and continue
            let valid = false;
            while(!valid) {
                valid = true;
                for(const [subrow, subcol] of child_grid.keys()) {
                    if(grid.has([row+subrow, col+subcol])) {
                        valid = false;
                        break;
                    }
                }
                if(valid) {
                    for(const [subrow, subcol] of child_grid.keys()) {
                        grid.set([row+subrow, col+subcol], child_grid.get([subrow, subcol]));
                    }
                } else {
                    grid.set([row, col], '|');
                }
                row += 1;
            }
        }
    }
    return grid;
}

function render_masto_thread_table(basepost, the_thread, vertical=true) {
    sort_hierarchy_by_engagement(basepost);
    // compute grid placement of posts
    const grid = compressed_grid_placement(basepost);
    let width=0, height=0;
    for(let [row, col] of grid.keys()) {
        if(row>height) {
            height = row;
        }
        if(col>width) {
            width = col;
        }
    }
    width = width+1;
    height = height+1;
    if(vertical) {
        [width, height] = [height, width];
    }
    // render the thread
    const table = document.createElement('table');
    table.classList.add('mastoview-table');
    for(let i = 0; i < height; i++) {
        const row = table.insertRow();
        for(let j = 0; j < width; j++) {
            const cell = row.insertCell();
            if(vertical) {
                [i, j] = [j, i];
            }
            console.log([i, j], grid.get([i, j]));
            if(grid.has([i, j])) {
                if(grid.get([i, j])=='|') {
                    cell.classList.add(vertical ? 'mastoview-table-horizontal-line' : 'mastoview-table-vertical-line');
                } else {
                    const postdiv = render_post(grid.get([i, j]), true)
                    cell.appendChild(postdiv);
                    if(grid.get([i, j]).children) {
                        const icon = document.createElement('div');
                        icon.classList.add(vertical ? 'connect-down' : 'connect-right');
                        cell.appendChild(icon);
                    }
                    if(grid.get([i, j]).has_next_sibling) {
                        const icon = document.createElement('div');
                        if(grid.get([i+1, j])!='|') {
                            icon.classList.add(vertical ? 'connect-right' : 'connect-down');
                        }
                        cell.appendChild(icon);
                    }
                }
            }
            if(vertical) { // swap back
                [i, j] = [j, i];
            }
        }
    }
    return table;
}

function render_masto_thread_table_vertical(basepost, the_thread) {
    return render_masto_thread_table(basepost, the_thread, true);
}

function render_masto_thread_table_horizontal(basepost, the_thread) {
    return render_masto_thread_table(basepost, the_thread, false);
}

////////////////////////// COMMON TO ALL METHODS //////////////////////////

function get_api_url_from_masto_url(url) {
    const url_parts = url.split('/');
    return url_parts[0]+'//'+url_parts[2]+'/api/v1/statuses/'+url_parts[url_parts.length-1];
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

function mastoview_read_url_params() {
    const urlParams = new URLSearchParams(window.location.search);
    const url = urlParams.get('url');
    let view = urlParams.get('view');
    if(view===null) {
        view = 'linear';
    }
    view = {'linear': render_masto_thread_linear,
            'table-vertical': render_masto_thread_table_vertical,
            'table-horizontal': render_masto_thread_table_horizontal}[view];
    if(url) {
        document.querySelector('#mastodon_url').value = url;
        mastoview_load_and_render(url, view);
    }
}