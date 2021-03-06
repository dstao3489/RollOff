function Player(name) {
    this.id = Math.floor((Math.random()*10000)+1);
    this.name = name;
    this.scores = [];
    this.rank = null;
}

Player.sort = {
    byName: function(a, b) {
        if (a.getName().toLowerCase() < b.getName().toLowerCase() )
            return -1;
        if (a.getName().toLowerCase() > b.getName().toLowerCase() )
            return 1;
        return 0; 
    },
    byRank: function(a, b) { return  a.getRank() - b.getRank(); },
    byLastScoreLowToHigh: function(a, b) { return a.getLastScore() - b.getLastScore(); },
    byLastScoreHighToLow: function(a,b) { return b.getLastScore() - a.getLastScore(); },
    byRoundScoreHighToLow: function(round,restartedPlayerOrder) {
        return function(a,b) {
            var n = b.getRoundScore(round) - a.getRoundScore(round);
            if (n > 0 || n < 0) return n;
            if (round > 0) return Player.sort.byRoundScoreHighToLow(round - 1, restartedPlayerOrder)(a,b);
            if (restartedPlayerOrder) return restartedPlayerOrder.indexOf(a) - restartedPlayerOrder.indexOf(b);
            return Player.sort.byName(a,b);
        }
    }
}

Player.filter = {
    isIn: function(p) { return p.isIn(); },
    isOut: function(p) { return p.isOut(); },
    wasInRound: function(round) {
        return function(p) {
            return p.getScores()[round] != undefined;
        }
    }
}

Player.prototype = {
    getId: function() { return this.id; },
    getName: function() { return this.name; },
    setRank: function(rank) { this.rank = rank; },
    getRank: function() { return this.rank; },
    addScore: function(score) { this.scores.push(score); },
    getScores: function() { return this.scores; },
    getRoundScore: function(round) { return this.scores[round]; },
    getLastScore: function() {
        if (this.scores.length > 0) {
            return this.scores[this.scores.length - 1]
        }
        return null;
    },
    toString: function() { return this.getName(); },
    isIn: function() { return this.getRank() == null},
    isOut: function() { return this.getRank() != null},
    reset: function() {
        this.scores = [];
        this.rank = null;
    }
}

function Game() {
    this.players = [];
    this.round = 0;
    this.cur = 0;
    this.restartedPlayerOrder = false;
    this.orderHistory = [];
}

Game.prototype = {
    getPlayer: function(id) {
        var player;
        $.each(this.players, function(i, p) {
            if (p.getId() == id) {
                player = p;
                return;
            }
        });
        return player;
    },

    getDisplayOrderedPlayers: function() { return this.getOrderOfPlayers().concat(this.players.filter(Player.filter.isOut).sort(Player.sort.byRank)); },

    getWinner: function() {
        var player;
        $.each(this.players, function(i, p) {
            if (p.rank == 1) {
                player = p;
                return;
            }
        });
        return player;
    },

    addPlayer: function(player) { this.players.push(player); },

    start: function() {
    	if (this.isOver()) {
            this.restartedPlayerOrder = this.getPlayersOutOfGame().sort(Player.sort.byRank);
    	}
        this.round = 0;
        this.cur = 0;
        $.each(this.players, function(i, p) {
            p.setRank(null);
            p.scores = [];
        });
        this.rank = this.players.length
        this.orderHistory = [];
        this.players = this.getOrderOfPlayers();
    },

    getPlayersInGame: function() { return this.players.filter(Player.filter.isIn); },

    getPlayersOutOfGame: function() { return this.players.filter(Player.filter.isOut); },

    getOrderOfPlayers: function() {
        return this.getPlayersInGame().sort(Player.sort.byRoundScoreHighToLow(this.round - 1, this.restartedPlayerOrder));
    },

    getCurrentPlayer: function() {
        var sorted = this.getOrderOfPlayers();
        if (sorted.length > 0) return sorted[this.cur];
        return undefined;
    },

    addScore: function(player, score) { 
        this.orderHistory.push(player.getId());
        player.addScore(score); 
        return this.advanceToNextPlayer();
    },

    addScoreToCurrentPlayer: function(score) { return this.addScore(this.getCurrentPlayer(), score); },

    dropLosers: function() {
        if (this.isOver()) return [];
        var ranked = this.getPlayersInGame().sort(Player.sort.byLastScoreLowToHigh);
        var allSame = true;
        $.each(ranked, function(i, p) {
            if (ranked[0].getLastScore() != p.getLastScore()) {
                allSame = false;
                return false;
            }
        });
        if (allSame && ranked.length > 1) {
            return [];
        }
        var losers = [];
        var currentRank = this.rank;
        var that = this;
        $.each(ranked, function(i, p) {
            if (p.getLastScore() == ranked[0].getLastScore()) {
                losers.push(p);
                that.rank -= 1;
            } else {
                return false;
            }
        });
        $.each(losers, function(i, p) {
            p.setRank(currentRank  - losers.length + 1);
        });
        return losers;
    },

    isOver: function() { return this.rank == 0; },

    nextRound: function() { this.round = this.round + 1; },
    
    advanceToNextPlayer: function() {
        var losers = [];
        this.cur = (this.cur + 1) % this.getPlayersInGame().length;
        if (this.cur == 0) {
            $.each(this.dropLosers(), function(i, p) {
                losers.push(p);
            });
            if (this.getPlayersInGame().length == 1) {
                losers.push(this.dropLosers()[0]);
            } else {
                this.nextRound();
            } 
        }
        return losers;
    },

    undoLast: function() {
        if (this.canUndoLast()) return false;
        if (this.cur == 0 && !this.isOver() && this.round > 0) {
            this.round -= 1;
        }
        var losers = this.players.filter(Player.filter.wasInRound(this.round)).filter(Player.filter.isOut);
        if (losers.length > 0) {
            $.each(losers, function(i, p) {
                p.setRank(null);
            });
            this.rank += losers.length;
        }
        var previousPlayer = this.getPlayer(this.orderHistory.pop());
        previousPlayer.getScores().pop();
        this.cur = (this.cur + this.getPlayersInGame().length - 1) % this.getPlayersInGame().length;
        return previousPlayer;
    },

    canUndoLast: function() { return this.orderHistory.length == 0; },
    hasEnoughPlayers: function() { return this.players.length > 1; },
    hasGameStarted: function() { return this.rank != undefined; },
    isNewRound: function() { return this.cur == 0; },
    getRound: function() { return this.round; },

}
