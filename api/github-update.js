export default async function handler(req, res) {
  console.log('API called with method:', req.method);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pages, token } = req.body;
    console.log('Received pages:', pages);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Get current file from GitHub
    console.log('Fetching from GitHub...');
    const getResponse = await fetch(
      'https://api.github.com/repos/ddgoncalves27/teste/contents/index.html?ref=main',
      {
        headers: {
          'Authorization': `token ${token}`, // Try 'token' format instead of 'Bearer'
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Vercel-Function'
        }
      }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error('GitHub fetch failed:', getResponse.status, errorText);
      return res.status(getResponse.status).json({ 
        error: `GitHub API error: ${getResponse.status}`,
        details: errorText 
      });
    }

    const fileData = await getResponse.json();
    console.log('Got file SHA:', fileData.sha);
    
    // Decode content
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    console.log('File size:', content.length);

    // Check if DISABLED_PAGES exists
    if (!content.includes('const DISABLED_PAGES')) {
      return res.status(400).json({ 
        error: 'DISABLED_PAGES not found in index.html' 
      });
    }

    // Update DISABLED_PAGES array
    const newArray = pages.length > 0 
      ? pages.map(p => `'${p}'`).join(',\n            ')
      : '';
    const newArrayString = `const DISABLED_PAGES = [\n            ${newArray}\n        ];`;
    
    const newContent = content.replace(
      /const DISABLED_PAGES = \[([\s\S]*?)\];/,
      newArrayString
    );

    console.log('Content updated, preparing to push...');

    // Update file on GitHub
    const updateResponse = await fetch(
      'https://api.github.com/repos/ddgoncalves27/teste/contents/index.html',
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`, // Use 'token' format
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Vercel-Function'
        },
        body: JSON.stringify({
          message: `Update disabled pages: ${pages.join(', ') || 'none'}`,
          content: Buffer.from(newContent, 'utf-8').toString('base64'),
          sha: fileData.sha,
          branch: 'main'
        })
      }
    );

    const responseText = await updateResponse.text();
    console.log('GitHub response:', updateResponse.status);

    if (!updateResponse.ok) {
      console.error('GitHub update failed:', responseText);
      return res.status(updateResponse.status).json({ 
        error: 'Failed to update file',
        details: responseText
      });
    }

    // Try to parse response
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { message: 'Updated but response not JSON' };
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Pages updated successfully',
      disabled: pages,
      commit: responseData.commit?.sha || 'unknown'
    });

  } catch (error) {
    console.error('Handler error:', error.message);
    console.error('Stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}
