import { useState, useEffect, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  ReferenceLine,
} from 'recharts'

// Spotify OAuth Configuration
const CLIENT_ID = '0eda6f52cf07499b96f1fec506d39e1c' // Replace with your Spotify Client ID
const REDIRECT_URI = 'https://127.0.0.1:5173'
const SCOPES = 'user-read-recently-played user-top-read'

// PKCE Helpers
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return values.reduce((acc, x) => acc + possible[x % possible.length], '')
}

async function sha256(plain) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return window.crypto.subtle.digest('SHA-256', data)
}

function base64urlencode(a) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier)
  return base64urlencode(hashed)
}

// Genre to mood/energy mapping
const GENRE_MOODS = {
  // High energy, high valence (happy, upbeat)
  'dance': { energy: 0.85, valence: 0.75 },
  'edm': { energy: 0.9, valence: 0.7 },
  'house': { energy: 0.85, valence: 0.65 },
  'pop': { energy: 0.7, valence: 0.7 },
  'party': { energy: 0.9, valence: 0.8 },
  'happy': { energy: 0.75, valence: 0.9 },
  'disco': { energy: 0.8, valence: 0.8 },
  'funk': { energy: 0.75, valence: 0.7 },
  'reggaeton': { energy: 0.8, valence: 0.7 },

  // High energy, low valence (intense, aggressive)
  'metal': { energy: 0.95, valence: 0.3 },
  'hardcore': { energy: 0.95, valence: 0.25 },
  'punk': { energy: 0.85, valence: 0.4 },
  'industrial': { energy: 0.85, valence: 0.25 },
  'death': { energy: 0.9, valence: 0.2 },
  'thrash': { energy: 0.9, valence: 0.3 },
  'grindcore': { energy: 0.95, valence: 0.2 },

  // Low energy, high valence (chill, happy)
  'acoustic': { energy: 0.35, valence: 0.6 },
  'folk': { energy: 0.4, valence: 0.55 },
  'reggae': { energy: 0.5, valence: 0.7 },
  'bossa nova': { energy: 0.35, valence: 0.65 },
  'lounge': { energy: 0.3, valence: 0.6 },
  'easy listening': { energy: 0.3, valence: 0.65 },

  // Low energy, low valence (sad, melancholic)
  'sad': { energy: 0.3, valence: 0.2 },
  'melancholy': { energy: 0.35, valence: 0.25 },
  'doom': { energy: 0.4, valence: 0.2 },
  'dark': { energy: 0.45, valence: 0.25 },
  'gothic': { energy: 0.5, valence: 0.3 },
  'ambient': { energy: 0.2, valence: 0.4 },
  'drone': { energy: 0.15, valence: 0.35 },

  // Mid-range genres
  'rock': { energy: 0.7, valence: 0.5 },
  'indie': { energy: 0.55, valence: 0.5 },
  'alternative': { energy: 0.6, valence: 0.45 },
  'hip hop': { energy: 0.7, valence: 0.55 },
  'rap': { energy: 0.75, valence: 0.5 },
  'r&b': { energy: 0.55, valence: 0.55 },
  'soul': { energy: 0.5, valence: 0.6 },
  'jazz': { energy: 0.45, valence: 0.55 },
  'blues': { energy: 0.45, valence: 0.35 },
  'country': { energy: 0.55, valence: 0.55 },
  'classical': { energy: 0.35, valence: 0.5 },
  'electronic': { energy: 0.7, valence: 0.5 },
  'synthwave': { energy: 0.65, valence: 0.55 },
  'lo-fi': { energy: 0.35, valence: 0.5 },
  'chill': { energy: 0.3, valence: 0.55 },
  'trap': { energy: 0.75, valence: 0.45 },
  'drill': { energy: 0.8, valence: 0.35 },
  'emo': { energy: 0.6, valence: 0.3 },
  'grunge': { energy: 0.65, valence: 0.35 },
  'shoegaze': { energy: 0.5, valence: 0.4 },
  'post-punk': { energy: 0.6, valence: 0.35 },
  'new wave': { energy: 0.65, valence: 0.55 },
  'techno': { energy: 0.8, valence: 0.5 },
  'trance': { energy: 0.8, valence: 0.6 },
  'dubstep': { energy: 0.85, valence: 0.45 },
}

// Estimate mood from genres
function estimateMoodFromGenres(genres) {
  if (!genres || genres.length === 0) {
    return { energy: 0.5, valence: 0.5 }
  }

  let totalEnergy = 0
  let totalValence = 0
  let matches = 0

  for (const genre of genres) {
    const lowerGenre = genre.toLowerCase()
    // Check for exact match or partial match
    for (const [key, mood] of Object.entries(GENRE_MOODS)) {
      if (lowerGenre.includes(key) || key.includes(lowerGenre)) {
        totalEnergy += mood.energy
        totalValence += mood.valence
        matches++
        break
      }
    }
  }

  if (matches === 0) {
    return { energy: 0.5, valence: 0.5 }
  }

  return {
    energy: totalEnergy / matches,
    valence: totalValence / matches
  }
}

// Energy to color mapping (cool blues to warm reds/oranges)
function energyToColor(energy) {
  if (energy < 0.25) return '#4da6ff' // cool blue
  if (energy < 0.5) return '#a855f7'  // purple
  if (energy < 0.75) return '#f97316' // orange
  return '#ef4444' // red
}

// Get glow color based on energy
function energyToGlow(energy) {
  if (energy < 0.25) return 'rgba(77, 166, 255, 0.6)'
  if (energy < 0.5) return 'rgba(168, 85, 247, 0.6)'
  if (energy < 0.75) return 'rgba(249, 115, 22, 0.6)'
  return 'rgba(239, 68, 68, 0.6)'
}

// Format time for display
function formatTime(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// Custom Tooltip Component
function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-navy-800/95 backdrop-blur-sm border border-navy-600 rounded-lg p-4 shadow-xl">
        <p className="text-white font-semibold text-sm mb-1">{data.name}</p>
        <p className="text-gray-400 text-xs mb-2">{data.artist}</p>
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-gray-500">Mood: </span>
            <span className="text-glow-purple">{(data.valence * 100).toFixed(0)}%</span>
          </div>
          <div>
            <span className="text-gray-500">Energy: </span>
            <span style={{ color: energyToColor(data.energy) }}>
              {(data.energy * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <p className="text-gray-500 text-xs mt-2">{formatTime(data.played_at)}</p>
      </div>
    )
  }
  return null
}

// Abstract Portrait SVG Component
function EmotionalPortrait({ stats }) {
  const { avgValence, avgEnergy, peakHour, valenceVariance, trackCount } = stats

  // Generate unique shapes based on stats
  const shapes = useMemo(() => {
    const result = []
    const centerX = 200
    const centerY = 200

    // Main emotional core - size based on track count, shape based on valence
    const coreSize = 40 + (trackCount / 100) * 30
    const corePoints = Math.floor(3 + avgValence * 5) // 3-8 sided polygon

    // Generate polygon points for main core
    const corePolygon = []
    for (let i = 0; i < corePoints; i++) {
      const angle = (i / corePoints) * Math.PI * 2 - Math.PI / 2
      const variance = 1 + (valenceVariance * Math.sin(i * 3) * 0.3)
      const x = centerX + Math.cos(angle) * coreSize * variance
      const y = centerY + Math.sin(angle) * coreSize * variance
      corePolygon.push(`${x},${y}`)
    }

    result.push({
      type: 'polygon',
      points: corePolygon.join(' '),
      fill: energyToColor(avgEnergy),
      opacity: 0.8,
      glow: true
    })

    // Orbital rings - number based on energy level
    const ringCount = Math.floor(2 + avgEnergy * 4)
    for (let i = 0; i < ringCount; i++) {
      const radius = 80 + i * 25
      const dashArray = `${5 + i * 3} ${10 + valenceVariance * 20}`
      const rotation = (peakHour / 24) * 360 + i * 30

      result.push({
        type: 'circle',
        cx: centerX,
        cy: centerY,
        r: radius,
        stroke: energyToColor(avgEnergy - i * 0.15),
        strokeWidth: 1 + (1 - avgValence) * 2,
        fill: 'none',
        dashArray,
        rotation,
        opacity: 0.4 - i * 0.08
      })
    }

    // Floating particles - represent emotional variance
    const particleCount = Math.floor(8 + valenceVariance * 30)
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const distance = 60 + Math.random() * 120
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance
      const size = 2 + Math.random() * 4 * valenceVariance

      result.push({
        type: 'dot',
        cx: x,
        cy: y,
        r: size,
        fill: energyToColor(Math.random()),
        opacity: 0.3 + Math.random() * 0.5
      })
    }

    // Hour indicator arc - shows peak listening time
    const hourAngle = ((peakHour - 6) / 24) * Math.PI * 2
    const arcX1 = centerX + Math.cos(hourAngle - 0.3) * 170
    const arcY1 = centerY + Math.sin(hourAngle - 0.3) * 170
    const arcX2 = centerX + Math.cos(hourAngle + 0.3) * 170
    const arcY2 = centerY + Math.sin(hourAngle + 0.3) * 170

    result.push({
      type: 'arc',
      d: `M ${arcX1} ${arcY1} A 170 170 0 0 1 ${arcX2} ${arcY2}`,
      stroke: '#ffffff',
      strokeWidth: 3,
      opacity: 0.3
    })

    return result
  }, [avgValence, avgEnergy, peakHour, valenceVariance, trackCount])

  // Generate background gradient based on mood
  const gradientColors = useMemo(() => {
    const baseHue = avgValence * 60 + avgEnergy * 30 // 0-90 range
    return {
      start: `hsl(${220 + baseHue}, 50%, 8%)`,
      end: `hsl(${260 + baseHue}, 40%, 12%)`
    }
  }, [avgValence, avgEnergy])

  return (
    <svg viewBox="0 0 400 400" className="w-full max-w-md mx-auto">
      <defs>
        <radialGradient id="bgGradient" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor={gradientColors.end} />
          <stop offset="100%" stopColor={gradientColors.start} />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="8" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width="400" height="400" fill="url(#bgGradient)" rx="20" />

      {/* Render shapes */}
      {shapes.map((shape, i) => {
        if (shape.type === 'polygon') {
          return (
            <polygon
              key={i}
              points={shape.points}
              fill={shape.fill}
              opacity={shape.opacity}
              filter={shape.glow ? 'url(#softGlow)' : undefined}
            />
          )
        }
        if (shape.type === 'circle') {
          return (
            <circle
              key={i}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              fill={shape.fill}
              strokeDasharray={shape.dashArray}
              opacity={shape.opacity}
              transform={`rotate(${shape.rotation} ${shape.cx} ${shape.cy})`}
            />
          )
        }
        if (shape.type === 'dot') {
          return (
            <circle
              key={i}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              fill={shape.fill}
              opacity={shape.opacity}
              filter="url(#glow)"
            />
          )
        }
        if (shape.type === 'arc') {
          return (
            <path
              key={i}
              d={shape.d}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              fill="none"
              opacity={shape.opacity}
              strokeLinecap="round"
            />
          )
        }
        return null
      })}
    </svg>
  )
}

// Generate poetic description
function generatePoetry(stats) {
  const { avgValence, avgEnergy, peakHour, valenceVariance } = stats

  const intensityWords = avgEnergy > 0.7 ? 'burning intensity' :
    avgEnergy > 0.5 ? 'steady warmth' :
    avgEnergy > 0.3 ? 'gentle pulse' : 'quiet stillness'

  const moodWords = avgValence > 0.7 ? 'radiant joy' :
    avgValence > 0.5 ? 'hopeful light' :
    avgValence > 0.3 ? 'pensive shadow' : 'melancholic depths'

  const timeWords = peakHour >= 22 || peakHour < 4 ? 'in the hours after midnight' :
    peakHour >= 4 && peakHour < 8 ? 'as dawn breaks' :
    peakHour >= 8 && peakHour < 12 ? 'through morning light' :
    peakHour >= 12 && peakHour < 17 ? 'under afternoon sun' :
    'as evening falls'

  const varianceWords = valenceVariance > 0.06 ?
    'Your heart swings wide between extremes.' :
    valenceVariance > 0.03 ?
    'You ride gentle waves of feeling.' :
    'Your emotional waters run steady and deep.'

  return `You listen with ${intensityWords} and ${moodWords}, mostly ${timeWords}. ${varianceWords}`
}

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-navy-600 rounded-full"></div>
        <div className="w-16 h-16 border-4 border-transparent border-t-glow-purple rounded-full absolute top-0 left-0 animate-spin"></div>
      </div>
      <p className="text-gray-400 mt-4 animate-pulse">Mapping your emotional landscape...</p>
    </div>
  )
}

// Main App Component
function App() {
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [trackData, setTrackData] = useState([])
  const [stats, setStats] = useState(null)

  // Check for auth callback on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')

    if (code) {
      exchangeCodeForToken(code)
    }

    // Check for stored token
    const storedToken = sessionStorage.getItem('spotify_access_token')
    const tokenExpiry = sessionStorage.getItem('spotify_token_expiry')

    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      setAccessToken(storedToken)
    }
  }, [])

  // Exchange authorization code for access token
  async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem('code_verifier')

    if (!verifier) {
      setError('Authentication failed: Missing code verifier')
      return
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
      })

      const data = await response.json()

      if (data.access_token) {
        setAccessToken(data.access_token)
        sessionStorage.setItem('spotify_access_token', data.access_token)
        sessionStorage.setItem('spotify_token_expiry', Date.now() + data.expires_in * 1000)

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)
      } else {
        setError('Failed to get access token')
      }
    } catch (err) {
      setError('Authentication error: ' + err.message)
    }
  }

  // Initiate Spotify login
  async function login() {
    const verifier = generateRandomString(128)
    const challenge = await generateCodeChallenge(verifier)

    sessionStorage.setItem('code_verifier', verifier)

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SCOPES,
    })

    window.location.href = `https://accounts.spotify.com/authorize?${params}`
  }

  // Fetch Spotify data
  async function fetchSpotifyData() {
    if (!accessToken) return

    setLoading(true)
    setError(null)

    try {
      // Fetch recently played and top tracks in parallel
      const [recentlyPlayedRes, topTracksRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch('https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      ])

      if (!recentlyPlayedRes.ok) {
        const err = await recentlyPlayedRes.json().catch(() => ({}))
        console.error('Recently played error:', recentlyPlayedRes.status, err)
        throw new Error(`Failed to fetch recently played: ${err.error?.message || recentlyPlayedRes.status}`)
      }
      if (!topTracksRes.ok) {
        const err = await topTracksRes.json().catch(() => ({}))
        console.error('Top tracks error:', topTracksRes.status, err)
        throw new Error(`Failed to fetch top tracks: ${err.error?.message || topTracksRes.status}`)
      }

      const [recentlyPlayed, topTracks] = await Promise.all([
        recentlyPlayedRes.json(),
        topTracksRes.json()
      ])

      // Combine tracks and get unique IDs
      const recentTracks = recentlyPlayed.items.map(item => ({
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists[0]?.name || 'Unknown',
        artistId: item.track.artists[0]?.id,
        popularity: item.track.popularity,
        played_at: item.played_at
      }))

      const topTracksList = topTracks.items.map(track => ({
        id: track.id,
        name: track.name,
        artist: track.artists[0]?.name || 'Unknown',
        artistId: track.artists[0]?.id,
        popularity: track.popularity,
        played_at: null
      }))

      // Get all unique track IDs and artist IDs
      const allTrackIds = [...new Set([...recentTracks.map(t => t.id), ...topTracksList.map(t => t.id)])].filter(Boolean)
      const allArtistIds = [...new Set([...recentTracks.map(t => t.artistId), ...topTracksList.map(t => t.artistId)])].filter(Boolean)
      console.log('Track IDs:', allTrackIds.length, 'Artist IDs:', allArtistIds.length)

      // Try to fetch audio features first (deprecated for new apps after Nov 27, 2024)
      let featuresMap = {}
      let audioFeaturesAvailable = false
      try {
        const audioFeaturesRes = await fetch(
          `https://api.spotify.com/v1/audio-features?ids=${allTrackIds.join(',')}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (audioFeaturesRes.ok) {
          const audioFeatures = await audioFeaturesRes.json()
          audioFeatures.audio_features?.forEach(feature => {
            if (feature) {
              featuresMap[feature.id] = feature
            }
          })
          audioFeaturesAvailable = Object.keys(featuresMap).length > 0
          console.log('Audio features available for', Object.keys(featuresMap).length, 'tracks')
        }
      } catch (err) {
        console.warn('Audio features endpoint failed:', err)
      }

      // Fetch artist genres as fallback/supplement
      let artistGenresMap = {}
      try {
        // Spotify allows up to 50 artists per request
        const artistBatches = []
        for (let i = 0; i < allArtistIds.length; i += 50) {
          artistBatches.push(allArtistIds.slice(i, i + 50))
        }

        for (const batch of artistBatches) {
          const artistsRes = await fetch(
            `https://api.spotify.com/v1/artists?ids=${batch.join(',')}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (artistsRes.ok) {
            const artistsData = await artistsRes.json()
            artistsData.artists?.forEach(artist => {
              if (artist) {
                artistGenresMap[artist.id] = artist.genres || []
              }
            })
          }
        }
        console.log('Fetched genres for', Object.keys(artistGenresMap).length, 'artists')
      } catch (err) {
        console.warn('Could not fetch artist genres:', err)
      }

      // Combine track data with mood estimates
      const enrichedTracks = recentTracks
        .map(track => {
          const audioFeature = featuresMap[track.id]
          const genres = artistGenresMap[track.artistId] || []
          const genreMood = estimateMoodFromGenres(genres)

          // Use audio features if available, otherwise use genre-based estimate
          // Add some variation based on track name and popularity
          const nameHash = track.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          const variation = ((nameHash % 20) - 10) / 100 // -0.1 to 0.1
          const popularityFactor = (track.popularity || 50) / 100

          let valence, energy, hasRealFeatures

          if (audioFeature) {
            valence = audioFeature.valence
            energy = audioFeature.energy
            hasRealFeatures = true
          } else if (genres.length > 0) {
            // Genre-based estimate with some variation
            valence = Math.max(0, Math.min(1, genreMood.valence + variation))
            energy = Math.max(0, Math.min(1, genreMood.energy + variation * 0.5))
            hasRealFeatures = false
          } else {
            // Fallback: use popularity as a rough proxy (popular songs tend to be more upbeat)
            valence = 0.3 + popularityFactor * 0.4 + variation
            energy = 0.4 + popularityFactor * 0.3 + variation
            hasRealFeatures = false
          }

          return {
            ...track,
            valence: Math.max(0, Math.min(1, valence)),
            energy: Math.max(0, Math.min(1, energy)),
            genres,
            timestamp: new Date(track.played_at).getTime(),
            hasRealFeatures
          }
        })
        .sort((a, b) => a.timestamp - b.timestamp)

      // Calculate statistics
      const valences = enrichedTracks.map(t => t.valence)
      const energies = enrichedTracks.map(t => t.energy)
      const hours = enrichedTracks.map(t => new Date(t.played_at).getHours())

      const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length
      const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length
      const valenceVariance = valences.reduce((sum, v) => sum + Math.pow(v - avgValence, 2), 0) / valences.length

      // Find peak listening hour
      const hourCounts = {}
      hours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1 })
      const peakHour = parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 12)

      const hasRealFeatures = enrichedTracks.some(t => t.hasRealFeatures)

      setStats({
        avgValence,
        avgEnergy,
        peakHour,
        valenceVariance,
        trackCount: enrichedTracks.length,
        hasRealFeatures
      })

      setTrackData(enrichedTracks)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fetch data when token is available
  useEffect(() => {
    if (accessToken && trackData.length === 0) {
      fetchSpotifyData()
    }
  }, [accessToken])

  // Render login screen
  if (!accessToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            Afterimage
          </h1>
          <p className="text-xl text-gray-400 mb-2">
            Your emotional portrait in sound
          </p>
          <p className="text-gray-500 mb-8 text-sm max-w-md">
            Connect your Spotify to visualize your listening history as an abstract emotional landscape.
            We'll analyze the mood and energy of your recent tracks to create your unique portrait.
          </p>

          <button
            onClick={login}
            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-glow-purple to-glow-pink rounded-full text-white font-semibold text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-glow-purple/30"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Connect with Spotify
          </button>

          {error && (
            <p className="mt-4 text-red-400 text-sm">{error}</p>
          )}

          <p className="mt-8 text-gray-600 text-xs">
            We only read your listening history. Your data stays in your browser.
          </p>
        </div>

        {/* Decorative background elements */}
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-glow-purple/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-glow-blue/5 rounded-full blur-3xl"></div>
        </div>
      </div>
    )
  }

  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">Something went wrong</h2>
          <p className="text-red-400 mb-6">{error}</p>
          <button
            onClick={() => { setError(null); fetchSpotifyData() }}
            className="px-6 py-3 bg-navy-700 rounded-lg text-white hover:bg-navy-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Render main visualization
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">
            Afterimage
          </h1>
          <p className="text-gray-400">Your emotional portrait in sound</p>
        </header>

        {/* Warning if no real audio features */}
        {stats && !stats.hasRealFeatures && (
          <div className="mb-8 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl text-center">
            <p className="text-amber-400 text-sm">
              Note: Spotify's audio features API is unavailable for this app.
              Mood and energy values are estimated from track data.
            </p>
          </div>
        )}

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <div className="bg-navy-800/50 backdrop-blur-sm rounded-xl p-4 border border-navy-700">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Avg Mood</p>
              <p className="text-2xl font-bold text-white">{(stats.avgValence * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.avgValence > 0.5 ? 'Uplifting' : 'Reflective'}
              </p>
            </div>
            <div className="bg-navy-800/50 backdrop-blur-sm rounded-xl p-4 border border-navy-700">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Avg Energy</p>
              <p className="text-2xl font-bold" style={{ color: energyToColor(stats.avgEnergy) }}>
                {(stats.avgEnergy * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.avgEnergy > 0.6 ? 'High intensity' : stats.avgEnergy > 0.4 ? 'Balanced' : 'Calm'}
              </p>
            </div>
            <div className="bg-navy-800/50 backdrop-blur-sm rounded-xl p-4 border border-navy-700">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Peak Hour</p>
              <p className="text-2xl font-bold text-white">
                {stats.peakHour > 12 ? stats.peakHour - 12 : stats.peakHour}
                <span className="text-lg text-gray-400">{stats.peakHour >= 12 ? 'PM' : 'AM'}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">Most active</p>
            </div>
            <div className="bg-navy-800/50 backdrop-blur-sm rounded-xl p-4 border border-navy-700">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Range</p>
              <p className="text-2xl font-bold text-glow-pink">
                {(Math.sqrt(stats.valenceVariance) * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Emotional variance</p>
            </div>
          </div>
        )}

        {/* Timeline Visualization */}
        <div className="bg-navy-800/30 backdrop-blur-sm rounded-2xl p-6 border border-navy-700 mb-12">
          <h2 className="text-xl font-semibold text-white mb-6">Mood Timeline</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  stroke="#4b5563"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis
                  dataKey="valence"
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  stroke="#4b5563"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  label={{ value: 'Mood', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 12 }}
                />
                <ReferenceLine y={0.5} stroke="#374151" strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip />} />
                <Scatter data={trackData} shape="circle">
                  {trackData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={energyToColor(entry.energy)}
                      style={{
                        filter: `drop-shadow(0 0 6px ${energyToGlow(entry.energy)})`
                      }}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-glow-blue shadow-lg shadow-glow-blue/50"></div>
              <span className="text-xs text-gray-400">Low energy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-glow-purple shadow-lg shadow-glow-purple/50"></div>
              <span className="text-xs text-gray-400">Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-glow-orange shadow-lg shadow-glow-orange/50"></div>
              <span className="text-xs text-gray-400">High</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-glow-red shadow-lg shadow-glow-red/50"></div>
              <span className="text-xs text-gray-400">Intense</span>
            </div>
          </div>
        </div>

        {/* EKG Line Chart */}
        <div className="bg-navy-800/30 backdrop-blur-sm rounded-2xl p-6 border border-navy-700 mb-12">
          <h2 className="text-xl font-semibold text-white mb-6">Emotional Rhythm</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trackData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                <XAxis dataKey="timestamp" hide />
                <YAxis domain={[0, 1]} hide />
                <Line
                  type="monotone"
                  dataKey="valence"
                  stroke="url(#lineGradient)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: '#a855f7', stroke: '#fff', strokeWidth: 2 }}
                />
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#4da6ff" />
                    <stop offset="50%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
                <Tooltip content={<CustomTooltip />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Portrait Section */}
        {stats && (
          <div className="bg-navy-800/30 backdrop-blur-sm rounded-2xl p-8 border border-navy-700 mb-12">
            <h2 className="text-xl font-semibold text-white mb-8 text-center">Your Emotional Portrait</h2>

            <div className="max-w-md mx-auto mb-8">
              <EmotionalPortrait stats={stats} />
            </div>

            <p className="text-center text-gray-300 text-lg italic max-w-lg mx-auto leading-relaxed">
              "{generatePoetry(stats)}"
            </p>
          </div>
        )}

        {/* Recent Tracks List */}
        <div className="bg-navy-800/30 backdrop-blur-sm rounded-2xl p-6 border border-navy-700">
          <h2 className="text-xl font-semibold text-white mb-6">Recent Tracks</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {trackData.slice().reverse().slice(0, 20).map((track, i) => (
              <div
                key={`${track.id}-${i}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-navy-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-8 rounded-full"
                    style={{
                      backgroundColor: energyToColor(track.energy),
                      boxShadow: `0 0 8px ${energyToGlow(track.energy)}`
                    }}
                  />
                  <div>
                    <p className="text-white text-sm font-medium">{track.name}</p>
                    <p className="text-gray-500 text-xs">{track.artist}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-xs">
                    {(track.valence * 100).toFixed(0)}% mood
                  </p>
                  <p className="text-gray-500 text-xs">
                    {formatTime(track.played_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-8 mt-8">
          <p className="text-gray-600 text-sm">
            Built with Spotify API. Your data stays in your browser.
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
