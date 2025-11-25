import os
import requests
from newspaper import Article


class ArticleData:
    """Data class to hold article information"""
    def __init__(self, title, text, summary, url):
        self.title = title
        self.text = text
        self.summary = summary
        self.url = url


def is_article_url(url: str) -> bool:
    """
    Check if a URL is likely an individual article rather than a category/listing page
    
    Args:
        url: The URL to check
    
    Returns:
        True if likely an article, False otherwise
    """
    # Skip obvious non-article patterns
    skip_patterns = [
        '/category/', '/tag/', '/topics/', '/subject/', '/section/',
        '/archive/', '/latest/', '/news/', '/technology/', '/science/',
        '/index.', '/home', '/main'
    ]
    
    url_lower = url.lower()
    
    # Skip if matches non-article patterns
    for pattern in skip_patterns:
        if pattern in url_lower:
            return False
    
    # Skip homepage URLs
    if url_lower.endswith(('.com/', '.org/', '.net/', '.edu/', '.gov/')):
        return False
    
    # Good indicators: URLs with dates, specific article paths, or long paths
    good_patterns = [
        '/article/', '/story/', '/post/', '/blog/',
        '/20', '/2024/', '/2025/',  # Year in URL
        '-', '_'  # Hyphens/underscores often in article slugs
    ]
    
    has_good_indicator = any(pattern in url_lower for pattern in good_patterns)
    
    # URL should have some path depth (not just domain.com/something)
    path_parts = url.split('/')[3:]  # Skip protocol and domain
    has_depth = len(path_parts) >= 2 or len(''.join(path_parts)) > 15
    
    return has_good_indicator or has_depth


def serpapi_search(query: str, num_results=10):
    """
    Search for articles using SerpAPI Google Search
    
    Args:
        query: The search query string
        num_results: Number of results to return (default: 10 to account for filtering)
    
    Returns:
        List of URLs from search results
    """
    # Enhance query to find individual articles, not homepages
    enhanced_query = f"{query} article -site:youtube.com -site:twitter.com"
    
    params = {
        "q": enhanced_query,
        "api_key": os.getenv("SERPAPI_API_KEY"),
        "engine": "google",
        "num": num_results,
        "tbs": "qdr:m"  # Results from past month for fresh articles
    }
    
    try:
        response = requests.get("https://serpapi.com/search", params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = []
        if "organic_results" in data:
            for result in data["organic_results"]:
                title = result.get("title")
                link = result.get("link")
                
                if title and link and is_article_url(link):
                    results.append((title, link))
                    print(f"📰 {title}\n🔗 {link}\n")
                    
                    # Stop when we have enough good URLs
                    if len(results) >= 8:
                        break
        
        return [url for _, url in results]
    
    except requests.RequestException as e:
        print(f"❌ SerpAPI request failed: {e}")
        return []
    except Exception as e:
        print(f"❌ Error in serpapi_search: {e}")
        return []


def extract_articles(urls):
    """
    Extract article content from URLs using newspaper3k
    
    Args:
        urls: List of article URLs
    
    Returns:
        List of ArticleData objects
    """
    articles = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    for url in urls:
        try:
            # Configure article to avoid XML parsing issues
            article = Article(url, headers=headers, keep_article_html=False, memoize_articles=False)
            article.download()
            article.parse()
            
            # Validate we have actual article content (not just a listing page)
            text_length = len(article.text.strip()) if article.text else 0
            
            if text_length < 500:
                print(f"⚠️ Skipping {url}: insufficient content ({text_length} chars)")
                continue
            
            # Check if it looks like an article (has paragraphs, not just links/menus)
            if article.text and article.text.count('\n') < 3:
                print(f"⚠️ Skipping {url}: doesn't look like an article")
                continue
            
            # Try NLP summarization, but don't fail if it errors
            summary = None
            try:
                article.nlp()
                summary = article.summary
            except Exception as nlp_error:
                # If NLP fails, use first 300 chars as summary
                print(f"ℹ️ NLP failed for {url}, using excerpt")
                summary = article.text[:300].strip() + "..."
            
            # Limit text to first 2000 characters for manageable response size
            truncated_text = article.text[:2000]
            articles.append(
                ArticleData(
                    title=article.title or "Untitled Article",
                    text=truncated_text,
                    summary=summary or truncated_text[:200],
                    url=url
                )
            )
            print(f"✅ Extracted: {article.title[:60]}...")
            
        except Exception as e:
            # Log error but continue trying other URLs
            error_msg = str(e)[:100]
            if "XML compatible" in str(e):
                print(f"⚠️ Skipping {url}: Invalid HTML/XML content")
            elif "403" in str(e) or "401" in str(e):
                print(f"⚠️ Skipping {url}: Access denied")
            else:
                print(f"❌ Error extracting from {url}: {error_msg}")
            continue
    
    return articles


def execute_pipeline(user_query: str, max_articles=3):
    """
    Main pipeline to search and extract news articles
    
    Args:
        user_query: The user's search query
        max_articles: Maximum number of articles to return (default: 3)
    
    Returns:
        List of ArticleData objects
    """
    print(f"🔍 Searching for: {user_query}")
    
    # Search with SerpAPI
    urls = serpapi_search(user_query, num_results=max_articles + 2)
    
    if not urls:
        print("⚠️ No URLs found from search")
        return []
    
    print(f"🔗 Found {len(urls)} URLs")
    
    # Extract articles
    articles = extract_articles(urls)
    print(f"📚 Successfully extracted {len(articles)} articles")
    
    # Return top N articles
    return articles[:max_articles]
