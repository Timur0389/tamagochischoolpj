import http.server
import socketserver
import json
import urllib.parse
import os
from datetime import datetime


class GameStats:
    
    def __init__(self):
        self.stats = {}
    
    def record_game(self, pet_name, fun_points, won=False):
        """Record a game session."""
        if pet_name not in self.stats:
            self.stats[pet_name] = {
                'games_played': 0,
                'total_fun': 0,
                'wins': 0,
                'last_played': None
            }
        
        self.stats[pet_name]['games_played'] += 1
        self.stats[pet_name]['total_fun'] += fun_points
        if won:
            self.stats[pet_name]['wins'] += 1
        self.stats[pet_name]['last_played'] = datetime.now().isoformat()
    
    def get_stats(self, pet_name=None):
        """Get statistics for a specific pet or all pets."""
        if pet_name:
            return self.stats.get(pet_name, {})
        return self.stats
    
    def get_leaderboard(self, limit=10):
        """Get top pets by total fun points."""
        sorted_pets = sorted(
            self.stats.items(),
            key=lambda x: x[1]['total_fun'],
            reverse=True
        )
        return [
            {
                'name': name,
                'total_fun': data['total_fun'],
                'games_played': data['games_played'],
                'wins': data['wins'],
                'avg_fun': data['total_fun'] / data['games_played'] if data['games_played'] > 0 else 0
            }
            for name, data in sorted_pets[:limit]
        ]


# Global stats instance
game_stats = GameStats()


class TamagochiHandler(http.server.SimpleHTTPRequestHandler):
    
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/api/stats':
            self.handle_get_stats(parsed_path.query)
        elif parsed_path.path == '/api/leaderboard':
            self.handle_leaderboard(parsed_path.query)
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/api/record':
            self.handle_record_game()
        else:
            self.send_error(404, "Not Found")
    
    def handle_get_stats(self, query):
        params = urllib.parse.parse_qs(query)
        pet_name = params.get('pet_name', [None])[0]
        
        stats = game_stats.get_stats(pet_name)
        self.send_json_response(stats)
    
    def handle_leaderboard(self, query):
        params = urllib.parse.parse_qs(query)
        limit = int(params.get('limit', ['10'])[0])
        
        leaderboard = game_stats.get_leaderboard(limit)
        self.send_json_response(leaderboard)
    
    def handle_record_game(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body.decode('utf-8'))
            pet_name = data.get('pet_name', 'Unknown')
            fun_points = int(data.get('fun_points', 0))
            won = bool(data.get('won', False))
            
            game_stats.record_game(pet_name, fun_points, won)
            
            self.send_json_response({
                'success': True,
                'message': 'Game recorded successfully'
            })
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            self.send_error(400, f"Bad Request: {str(e)}")
    
    def send_json_response(self, data):
        response = json.dumps(data, indent=2).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)
    
    def log_message(self, format, *args):
        """Override to customize log format."""
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {format % args}")


def calculate_fun_level(fun_points):
    if fun_points < 50:
        return {'level': 1, 'description': 'Just Starting'}
    elif fun_points < 100:
        return {'level': 2, 'description': 'Getting Happy'}
    elif fun_points < 200:
        return {'level': 3, 'description': 'Having Fun'}
    elif fun_points < 350:
        return {'level': 4, 'description': 'Very Happy'}
    elif fun_points < 500:
        return {'level': 5, 'description': 'Super Happy'}
    elif fun_points < 700:
        return {'level': 6, 'description': 'Extremely Happy'}
    elif fun_points < 1000:
        return {'level': 7, 'description': 'Ultra Happy'}
    elif fun_points < 1500:
        return {'level': 8, 'description': 'Maximum Happiness'}
    elif fun_points < 2500:
        return {'level': 9, 'description': 'Legendary Pet'}
    else:
        return {'level': 10, 'description': 'God of Happiness'}


def validate_pet_name(name):
    if not name:
        return False, "Pet name cannot be empty"
    
    if len(name) > 16:
        return False, "Pet name must be 16 characters or less"
    
    if not name.strip():
        return False, "Pet name cannot be only whitespace"
    
    allowed_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_')
    if not all(c in allowed_chars for c in name):
        return False, "Pet name contains invalid characters"
    
    return True, None


def calculate_game_score(fun_points, games_played, wins):
    base_score = fun_points * 0.5
    win_bonus = wins * 20
    participation_bonus = games_played * 5
    return int(base_score + win_bonus + participation_bonus)


def main():
    PORT = 8000
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    handler = TamagochiHandler
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print("=" * 60)
        print("Tamagochi School Project - Python Server")
        print("=" * 60)
        print(f"Server running at http://localhost:{PORT}/")
        print(f"Serving files from: {script_dir}")
        print("\nAvailable endpoints:")
        print(f"  GET  http://localhost:{PORT}/api/stats?pet_name=Name")
        print(f"  GET  http://localhost:{PORT}/api/leaderboard?limit=10")
        print(f"  POST http://localhost:{PORT}/api/record")
        print("\nPress Ctrl+C to stop the server")
        print("=" * 60)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")


if __name__ == '__main__':
    main()
